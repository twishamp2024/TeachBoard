import { strToU8, unzipSync, zipSync, strFromU8 } from 'fflate'
import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { addSection, createDocument, createPage } from '../../src/renderer/src/core/document'
import type { BoardObject, LessonDocument } from '../../src/renderer/src/core/model'
import { deserializeLesson, FORMAT_VERSION, LessonFormatError, MIMETYPE, readPreview, serializeLesson } from '../../src/renderer/src/core/serialization'

const opts = { appName: 'Test', appVersion: '1.0.0' }
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4])

const OBJECTS: BoardObject[] = [
  { id: 'o1', type: 'stroke', tool: 'pen', style: 'pen', color: '#D93B3B', width: 6, opacity: 1, points: [1, 2, 0.3, 3, 4, 0.9], pressure: true },
  { id: 'o2', type: 'stroke', tool: 'highlighter', style: 'marker', color: '#FFE14D', width: 22, opacity: 0.42, points: [1, 2, 0.5, 30, 4, 0.5], pressure: false },
  { id: 'o3', type: 'shape', kind: 'star', x: 10, y: 20, w: 30, h: 40, stroke: '#000000', fill: '#F2C522', strokeWidth: 3, dash: 'dashed', flipX: true, flipY: false },
  { id: 'o4', type: 'line', x1: 0, y1: 0, x2: 100, y2: 50, stroke: '#1E88E5', strokeWidth: 3, dash: 'dotted', startCap: 'dot', endCap: 'arrow' },
  { id: 'o5', type: 'polygon', points: [0, 0, 10, 0, 5, 8], closed: true, stroke: '#000', fill: null, strokeWidth: 2, dash: 'solid' },
  { id: 'o6', type: 'text', x: 5, y: 6, w: 300, h: 60, text: 'Hello\nclass', fontFamily: 'Patrick Hand', fontSize: 32, color: '#123456', bold: true, italic: true, underline: true, align: 'center', background: '#FFFFFF' },
  { id: 'o7', type: 'math', x: 1, y: 2, w: 200, h: 50, latex: '\\frac{a}{b}+\\sqrt{x}', color: '#000000', fontSize: 44 },
  { id: 'o8', type: 'image', x: 0, y: 0, w: 64, h: 32, assetId: 'a1', opacity: 0.8, name: 'logo.png' },
  { id: 'o9', type: 'table', x: 0, y: 0, colWidths: [100, 120], rowHeights: [40, 40], cells: [['h1', 'h2'], ['a', 'b']], stroke: '#555', strokeWidth: 2, fill: '#fff', headerFill: '#eee', color: '#000', fontFamily: 'Inter', fontSize: 20 }
]

function richDoc(): LessonDocument {
  return produce(createDocument(), (d) => {
    d.title = 'Fractions – Week 3'
    d.assets['a1'] = { id: 'a1', mime: 'image/png', name: 'logo.png', data: PNG }
    d.assets['unused'] = { id: 'unused', mime: 'image/png', name: 'x', data: PNG }
    const p = d.sections[0].pages[0]
    p.objects.push(...(OBJECTS as never[]))
    p.background = { color: '#21463A', pattern: 'graph', patternColor: '#355E50', spacing: 24, imageAssetId: 'a1', imageFit: 'contain' }
    const second = createPage({ width: 1240, height: 1754, background: { ...d.pageDefaults.background, pattern: 'lines' } })
    addSection(d as LessonDocument, 'Homework', d.sections[0].id, second)
  })
}

describe('lesson file round trip', () => {
  it('preserves every object type, pages, sections, sizes, backgrounds and assets', () => {
    const doc = richDoc()
    const bytes = serializeLesson(doc, { ...opts, preview: PNG })
    const { doc: back, warnings } = deserializeLesson(bytes)
    expect(warnings).toEqual([])
    expect(back.title).toBe(doc.title)
    expect(back.sections.map((s) => s.name)).toEqual(['Section 1', 'Homework'])
    expect(back.sections[0].pages[0].objects).toEqual(OBJECTS)
    expect(back.sections[0].pages[0].background).toEqual(doc.sections[0].pages[0].background)
    expect(back.sections[1].pages[0]).toMatchObject({ width: 1240, height: 1754 })
    expect(back.sections[1].pages[0].background.pattern).toBe('lines')
    expect(Array.from(back.assets['a1'].data)).toEqual(Array.from(PNG))
    // Unreferenced assets are not written.
    expect(back.assets['unused']).toBeUndefined()
    expect(Array.from(readPreview(bytes)!)).toEqual(Array.from(PNG))
  })

  it('writes the documented container layout', () => {
    const files = unzipSync(serializeLesson(richDoc(), opts))
    expect(strFromU8(files['mimetype'])).toBe(MIMETYPE)
    const manifest = JSON.parse(strFromU8(files['manifest.json']))
    expect(manifest).toMatchObject({ format: 'teachboard-lesson', formatVersion: FORMAT_VERSION })
    expect(Object.keys(files)).toContain('assets/a1.png')
  })

  it('is stable across repeated save/open cycles', () => {
    let doc = richDoc()
    for (let i = 0; i < 3; i++) doc = deserializeLesson(serializeLesson(doc, opts)).doc
    expect(doc.sections[0].pages[0].objects).toEqual(OBJECTS)
  })
})

describe('invalid files', () => {
  const expectError = (bytes: Uint8Array, pattern: RegExp) => {
    let err: unknown
    try {
      deserializeLesson(bytes)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(LessonFormatError)
    expect((err as Error).message).toMatch(pattern)
  }

  it('rejects files that are not zip archives', () => {
    expectError(strToU8('hello world, definitely not a lesson'), /not a lesson file/)
    expectError(new Uint8Array(0), /not a lesson file/)
  })

  it('rejects archives without the lesson mimetype', () => {
    expectError(zipSync({ 'readme.txt': strToU8('x') }), /not a lesson file/)
  })

  it('rejects lessons from a newer format version', () => {
    const files = unzipSync(serializeLesson(createDocument(), opts))
    files['manifest.json'] = strToU8(JSON.stringify({ format: 'teachboard-lesson', formatVersion: FORMAT_VERSION + 1, appVersion: '9.0.0' }))
    expectError(zipSync(files), /newer version/)
  })

  it('rejects malformed document content with a helpful path', () => {
    const files = unzipSync(serializeLesson(createDocument(), opts))
    const body = JSON.parse(strFromU8(files['document.json']))
    body.sections[0].pages[0].objects.push({ id: 'bad', type: 'shape', kind: 'blob' })
    files['document.json'] = strToU8(JSON.stringify(body))
    expectError(zipSync(files), /invalid/)
    files['document.json'] = strToU8('{ not json')
    expectError(zipSync(files), /not valid JSON/)
  })

  it('opens files with missing assets but drops the broken references', () => {
    const files = unzipSync(serializeLesson(richDoc(), opts))
    delete files['assets/a1.png']
    const { doc, warnings } = deserializeLesson(zipSync(files))
    expect(warnings.length).toBeGreaterThan(0)
    expect(doc.sections[0].pages[0].objects.find((o) => o.type === 'image')).toBeUndefined()
    expect(doc.sections[0].pages[0].background.imageAssetId).toBeNull()
  })
})
