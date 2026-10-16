import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { z } from 'zod'
import { referencedAssetIds } from './document'
import { PATTERN_KINDS, SHAPE_KINDS, type Asset, type LessonDocument } from './model'

/**
 * Native lesson format (.tboard) — see docs/FILE_FORMAT.md.
 *
 *   mimetype            "application/x-teachboard" (stored, first entry)
 *   manifest.json       { format, formatVersion, appName, appVersion, … }
 *   document.json       the LessonDocument without asset bytes
 *   assets/<id>.<ext>   binary assets referenced by id
 *   preview.png         optional first-page preview
 */

export const FORMAT_ID = 'teachboard-lesson'
export const FORMAT_VERSION = 1
export const MIMETYPE = 'application/x-teachboard'

export class LessonFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LessonFormatError'
  }
}

// ---------------------------------------------------------------------------
// Schemas

const num = z.number().finite()
const color = z.string().max(64)
const nullableColor = color.nullable()
const dash = z.enum(['solid', 'dashed', 'dotted'])
const cap = z.enum(['none', 'arrow', 'dot'])
const id = z.string().min(1).max(128)

const strokeSchema = z.object({
  id,
  type: z.literal('stroke'),
  tool: z.enum(['pen', 'highlighter']),
  style: z.enum(['pen', 'marker', 'dashed']).default('pen'),
  color,
  width: num.positive(),
  opacity: num.min(0).max(1),
  points: z.array(num).refine((p) => p.length % 3 === 0 && p.length >= 3, 'points must be x,y,pressure triplets'),
  pressure: z.boolean().default(false)
})

const shapeSchema = z.object({
  id,
  type: z.literal('shape'),
  kind: z.enum(SHAPE_KINDS as [string, ...string[]]),
  x: num,
  y: num,
  w: num,
  h: num,
  stroke: color,
  fill: nullableColor,
  strokeWidth: num.min(0),
  dash,
  flipX: z.boolean().default(false),
  flipY: z.boolean().default(false)
})

const lineSchema = z.object({
  id,
  type: z.literal('line'),
  x1: num,
  y1: num,
  x2: num,
  y2: num,
  stroke: color,
  strokeWidth: num.positive(),
  dash,
  startCap: cap,
  endCap: cap
})

const polygonSchema = z.object({
  id,
  type: z.literal('polygon'),
  points: z.array(num).refine((p) => p.length % 2 === 0 && p.length >= 4, 'points must be x,y pairs'),
  closed: z.boolean(),
  stroke: color,
  fill: nullableColor,
  strokeWidth: num.min(0),
  dash
})

const textSchema = z.object({
  id,
  type: z.literal('text'),
  x: num,
  y: num,
  w: num.positive(),
  h: num.min(0),
  text: z.string().max(200_000),
  fontFamily: z.string().max(200),
  fontSize: num.positive(),
  color,
  bold: z.boolean(),
  italic: z.boolean(),
  underline: z.boolean(),
  align: z.enum(['left', 'center', 'right']),
  background: nullableColor.default(null)
})

const mathSchema = z.object({
  id,
  type: z.literal('math'),
  x: num,
  y: num,
  w: num.min(0),
  h: num.min(0),
  latex: z.string().max(50_000),
  color,
  fontSize: num.positive()
})

const imageSchema = z.object({
  id,
  type: z.literal('image'),
  x: num,
  y: num,
  w: num.positive(),
  h: num.positive(),
  assetId: id,
  opacity: num.min(0).max(1).default(1),
  name: z.string().max(500).default('')
})

const tableSchema = z
  .object({
    id,
    type: z.literal('table'),
    x: num,
    y: num,
    colWidths: z.array(num.positive()).min(1).max(100),
    rowHeights: z.array(num.positive()).min(1).max(500),
    cells: z.array(z.array(z.string().max(20_000))),
    stroke: color,
    strokeWidth: num.min(0),
    fill: nullableColor,
    headerFill: nullableColor,
    color,
    fontFamily: z.string().max(200),
    fontSize: num.positive()
  })
  .refine(
    (t) => t.cells.length === t.rowHeights.length && t.cells.every((r) => r.length === t.colWidths.length),
    'table cells do not match its rows and columns'
  )

const objectSchema = z.union([strokeSchema, shapeSchema, lineSchema, polygonSchema, textSchema, mathSchema, imageSchema, tableSchema])

const backgroundSchema = z.object({
  color,
  pattern: z.enum(PATTERN_KINDS as [string, ...string[]]),
  patternColor: color,
  spacing: num.min(4).max(1000),
  imageAssetId: id.nullable(),
  imageFit: z.enum(['cover', 'contain', 'stretch', 'center'])
})

const pageSchema = z.object({
  id,
  width: num.min(50).max(20000),
  height: num.min(50).max(20000),
  background: backgroundSchema,
  objects: z.array(objectSchema)
})

const sectionSchema = z.object({
  id,
  name: z.string().max(500),
  collapsed: z.boolean().default(false),
  pages: z.array(pageSchema)
})

const assetMetaSchema = z.object({ id, mime: z.string().max(100), name: z.string().max(500).default(''), path: z.string().max(300) })

const documentSchema = z.object({
  id,
  title: z.string().max(500),
  createdAt: z.string().max(64),
  modifiedAt: z.string().max(64),
  pageDefaults: z.object({ width: num.min(50).max(20000), height: num.min(50).max(20000), background: backgroundSchema }),
  sections: z.array(sectionSchema).min(1),
  assets: z.array(assetMetaSchema)
})

const manifestSchema = z.object({
  format: z.literal(FORMAT_ID),
  formatVersion: z.number().int().positive(),
  appName: z.string().optional(),
  appVersion: z.string().optional(),
  savedAt: z.string().optional()
})

// ---------------------------------------------------------------------------
// Write

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg'
}

export interface SerializeOptions {
  appName: string
  appVersion: string
  preview?: Uint8Array | null
}

export function serializeLesson(doc: LessonDocument, opts: SerializeOptions): Uint8Array {
  const used = referencedAssetIds(doc)
  const files: Zippable = {}
  // The mimetype entry is stored uncompressed so it can be sniffed.
  files['mimetype'] = [strToU8(MIMETYPE), { level: 0 }]
  files['manifest.json'] = strToU8(
    JSON.stringify(
      { format: FORMAT_ID, formatVersion: FORMAT_VERSION, appName: opts.appName, appVersion: opts.appVersion, savedAt: new Date().toISOString() },
      null,
      2
    )
  )
  const assets: z.infer<typeof assetMetaSchema>[] = []
  for (const assetId of used) {
    const asset = doc.assets[assetId]
    if (!asset) continue
    const path = `assets/${asset.id}.${EXT_BY_MIME[asset.mime] ?? 'bin'}`
    assets.push({ id: asset.id, mime: asset.mime, name: asset.name, path })
    // Already-compressed formats are stored as-is.
    const compressible = asset.mime === 'image/svg+xml' || asset.mime === 'image/bmp'
    files[path] = [asset.data, { level: compressible ? 6 : 0 }]
  }
  const body = {
    id: doc.id,
    title: doc.title,
    createdAt: doc.createdAt,
    modifiedAt: doc.modifiedAt,
    pageDefaults: doc.pageDefaults,
    sections: doc.sections,
    assets
  }
  files['document.json'] = strToU8(JSON.stringify(body))
  if (opts.preview) files['preview.png'] = [opts.preview, { level: 0 }]
  return zipSync(files, { level: 6 })
}

// ---------------------------------------------------------------------------
// Read

export interface DeserializeResult {
  doc: LessonDocument
  warnings: string[]
}

type RawDoc = Record<string, unknown>

/** Upgrades older document.json payloads to the current format version. */
export function migrate(raw: RawDoc, fromVersion: number): RawDoc {
  let doc = raw
  if (fromVersion < 1) {
    // Version 0 never shipped; kept as the template for future migrations.
    doc = { ...doc }
  }
  return doc
}

export function deserializeLesson(bytes: Uint8Array): DeserializeResult {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch {
    throw new LessonFormatError('This file is not a lesson file or it is damaged.')
  }
  const mimetype = entries['mimetype'] ? strFromU8(entries['mimetype']).trim() : ''
  if (mimetype !== MIMETYPE || !entries['manifest.json'] || !entries['document.json']) {
    throw new LessonFormatError('This file is not a lesson file or it is damaged.')
  }

  let manifest: z.infer<typeof manifestSchema>
  try {
    manifest = manifestSchema.parse(JSON.parse(strFromU8(entries['manifest.json'])))
  } catch {
    throw new LessonFormatError('The lesson file has an invalid manifest.')
  }
  if (manifest.formatVersion > FORMAT_VERSION) {
    throw new LessonFormatError(
      `This lesson was created with a newer version${manifest.appVersion ? ` (${manifest.appVersion})` : ''}. Please update the application to open it.`
    )
  }

  let raw: RawDoc
  try {
    raw = JSON.parse(strFromU8(entries['document.json'])) as RawDoc
  } catch {
    throw new LessonFormatError('The lesson content could not be read (document.json is not valid JSON).')
  }
  raw = migrate(raw, manifest.formatVersion)

  const parsed = documentSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new LessonFormatError(`The lesson content is invalid: ${issue?.path.join('.') || 'document'} — ${issue?.message ?? 'unknown error'}.`)
  }
  const data = parsed.data
  const warnings: string[] = []

  const assets: Record<string, Asset> = {}
  for (const meta of data.assets) {
    const bytesForAsset = entries[meta.path]
    if (!bytesForAsset) {
      warnings.push(`Missing asset "${meta.name || meta.id}".`)
      continue
    }
    assets[meta.id] = { id: meta.id, mime: meta.mime, name: meta.name, data: bytesForAsset }
  }

  // Drop references to assets that are not in the file so rendering never fails.
  const sections = data.sections.map((s) => ({
    ...s,
    pages: s.pages.map((p) => {
      const background = { ...p.background }
      if (background.imageAssetId && !assets[background.imageAssetId]) {
        warnings.push('A page background image is missing and was removed.')
        background.imageAssetId = null
      }
      const objects = p.objects.filter((o) => {
        if (o.type === 'image' && !assets[o.assetId]) {
          warnings.push(`Image "${o.name || o.id}" is missing and was removed.`)
          return false
        }
        return true
      })
      return { ...p, background, objects }
    })
  }))

  const pageDefaults = { ...data.pageDefaults, background: { ...data.pageDefaults.background } }
  if (pageDefaults.background.imageAssetId && !assets[pageDefaults.background.imageAssetId]) pageDefaults.background.imageAssetId = null

  if (!sections.some((s) => s.pages.length > 0)) {
    throw new LessonFormatError('The lesson file contains no pages.')
  }

  const doc = {
    id: data.id,
    title: data.title,
    createdAt: data.createdAt,
    modifiedAt: data.modifiedAt,
    pageDefaults,
    sections,
    assets
  } as LessonDocument

  return { doc, warnings: Array.from(new Set(warnings)) }
}

/** Extracts the stored preview image, if any, without validating the rest. */
export function readPreview(bytes: Uint8Array): Uint8Array | null {
  try {
    const entries = unzipSync(bytes, { filter: (f) => f.name === 'preview.png' })
    return entries['preview.png'] ?? null
  } catch {
    return null
  }
}
