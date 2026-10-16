import { cloneObject, newId } from '../core/document'
import { objectBounds, unionRects } from '../core/geometry'
import type { Asset, BoardObject, ImageObject } from '../core/model'
import { drawObject } from '../core/render'
import { resources } from '../core/resources'
import { addObjects, centeredRect, deleteSelection, getSelectedObjects, insertImages, insertTextAt } from './ops'
import { useDoc } from './doc'
import { useUi } from './ui'

/**
 * Copy/paste. Objects are kept in an in-app clipboard (they reference
 * assets and are richer than anything the system clipboard can carry). The
 * system clipboard also receives plain text and a PNG of the selection so
 * content can be pasted into other applications.
 */
interface ClipData {
  objects: BoardObject[]
  assets: Asset[]
  /** Text written to the system clipboard alongside, used to recognise our own copy. */
  marker: string
  pasteCount: number
}

let clip: ClipData | null = null

function selectionText(objs: BoardObject[]): string {
  const texts = objs.flatMap((o) => (o.type === 'text' ? [o.text] : o.type === 'math' ? [o.latex] : o.type === 'table' ? [o.cells.map((r) => r.join('\t')).join('\n')] : []))
  return texts.join('\n\n')
}

async function selectionPng(objs: BoardObject[]): Promise<Blob | null> {
  const doc = useDoc.getState().doc
  const b = unionRects(objs.map(objectBounds))
  if (!b || b.w < 1 || b.h < 1) return null
  await resources.ensurePages(doc, [{ id: 'clip', width: b.w, height: b.h, background: { color: '#fff', pattern: 'none', patternColor: '#000', spacing: 40, imageAssetId: null, imageFit: 'cover' }, objects: objs }])
  const scale = Math.min(2, 4000 / Math.max(b.w, b.h))
  const pad = 8
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil((b.w + pad * 2) * scale)
  canvas.height = Math.ceil((b.h + pad * 2) * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(scale, 0, 0, scale, (pad - b.x) * scale, (pad - b.y) * scale)
  for (const o of objs) drawObject(ctx, o, { doc, resources })
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}

export async function copySelection(cut = false): Promise<void> {
  const objs = getSelectedObjects()
  if (!objs.length) return
  const doc = useDoc.getState().doc
  const assetIds = new Set(objs.filter((o): o is ImageObject => o.type === 'image').map((o) => o.assetId))
  const text = selectionText(objs)
  const marker = text || `${objs.length} object${objs.length === 1 ? '' : 's'} copied from the whiteboard`
  clip = {
    objects: structuredClone(objs),
    assets: [...assetIds].map((id) => doc.assets[id]).filter(Boolean),
    marker,
    pasteCount: 0
  }
  if (cut) deleteSelection()
  try {
    const png = await selectionPng(objs)
    const items: Record<string, Blob> = { 'text/plain': new Blob([marker], { type: 'text/plain' }) }
    if (png) items['image/png'] = png
    await navigator.clipboard.write([new ClipboardItem(items)])
  } catch {
    try {
      await navigator.clipboard.writeText(marker)
    } catch {
      // The in-app clipboard still works.
    }
  }
}

function pasteInternal(): void {
  if (!clip) return
  clip.pasteCount++
  const offset = 24 * clip.pasteCount
  const doc = useDoc.getState().doc
  // Reuse existing assets; re-add any that were dropped from this document.
  const missing = clip.assets.filter((a) => !doc.assets[a.id])
  const objects = clip.objects.map((o) => cloneObject(o, offset, offset))
  addObjects(objects, 'Paste', true, missing)
  useUi.getState().setTool('select')
}

export async function paste(): Promise<void> {
  let text = ''
  let image: { bytes: Uint8Array; mime: string } | null = null
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      const imgType = item.types.find((t) => t.startsWith('image/'))
      if (imgType && !image) {
        const blob = await item.getType(imgType)
        image = { bytes: new Uint8Array(await blob.arrayBuffer()), mime: imgType }
      }
      if (item.types.includes('text/plain') && !text) {
        text = await (await item.getType('text/plain')).text()
      }
    }
  } catch {
    // Clipboard unavailable; fall back to the in-app clipboard.
  }
  if (clip && (text === clip.marker || (!text && !image))) {
    pasteInternal()
    return
  }
  if (image) {
    await insertImages([{ name: 'Pasted image', mime: image.mime, bytes: image.bytes }])
    return
  }
  if (text.trim()) {
    insertTextAt(text.replace(/\r\n?/g, '\n').slice(0, 20000))
    useUi.getState().setTool('select')
    return
  }
  if (clip) pasteInternal()
}

export function hasClipboard(): boolean {
  return clip !== null
}

/** Inserts objects from the resource library (fresh ids, centred). */
export function insertObjectsCentered(objects: BoardObject[], assets: Asset[], label: string): void {
  const b = unionRects(objects.map(objectBounds))
  if (!b) return
  const target = centeredRect(b.w, b.h)
  const dx = target.x - b.x
  const dy = target.y - b.y
  const remapped = new Map<string, string>()
  const doc = useDoc.getState().doc
  const newAssets: Asset[] = []
  for (const a of assets) {
    if (doc.assets[a.id]) continue
    const id = newId('a')
    remapped.set(a.id, id)
    newAssets.push({ ...a, id })
  }
  const objs = objects.map((o) => {
    const c = cloneObject(o, dx, dy)
    if (c.type === 'image' && remapped.has(c.assetId)) c.assetId = remapped.get(c.assetId)!
    return c
  })
  addObjects(objs, label, true, newAssets)
  useUi.getState().setTool('select')
}
