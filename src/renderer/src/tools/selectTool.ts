import { translateObjectData } from '../core/document'
import {
  hitTest,
  objectBounds,
  objectFrame,
  prefersUniformScale,
  rectFromPoints,
  rectsIntersect,
  scaleObject,
  unionRects,
  type Rect
} from '../core/geometry'
import type { BoardObject, Id, LineObject } from '../core/model'
import { snapAngle } from '../core/strokes'
import { currentPage, onPage, useDoc } from '../state/doc'
import { relayout } from '../state/ops'
import { useUi } from '../state/ui'
import { beginTextEdit } from './textTools'
import type { PointerSample, Tool, ToolContext } from './types'

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'p1' | 'p2'

const HANDLE_PX = 9
const DRAG_PX = 3

export const HANDLE_CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  p1: 'move',
  p2: 'move'
}

/** The frame used for selection handles (geometric, without stroke padding). */
export function selectionFrame(objs: BoardObject[]): Rect | null {
  return unionRects(objs.map(objectFrame))
}

export function handlePositions(r: Rect): [Handle, number, number][] {
  const { x, y, w, h } = r
  return [
    ['nw', x, y],
    ['n', x + w / 2, y],
    ['ne', x + w, y],
    ['e', x + w, y + h / 2],
    ['se', x + w, y + h],
    ['s', x + w / 2, y + h],
    ['sw', x, y + h],
    ['w', x, y + h / 2]
  ]
}

function selected(): BoardObject[] {
  const s = useDoc.getState()
  const ids = new Set(s.selection)
  return currentPage(s).objects.filter((o) => ids.has(o.id))
}

/** True when the object is inside or crossed by the marquee. */
export function objectInRect(o: BoardObject, r: Rect): boolean {
  const b = objectBounds(o)
  if (!rectsIntersect(b, r)) return false
  if (b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h) return true
  if (o.type === 'stroke') {
    for (let i = 0; i < o.points.length; i += 3) {
      const px = o.points[i]
      const py = o.points[i + 1]
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return true
    }
    return false
  }
  if (o.type === 'polygon') {
    for (let i = 0; i < o.points.length; i += 2) {
      if (o.points[i] >= r.x && o.points[i] <= r.x + r.w && o.points[i + 1] >= r.y && o.points[i + 1] <= r.y + r.h) return true
    }
    return false
  }
  return true
}

/** Topmost object under the point. */
export function pickObject(objects: BoardObject[], x: number, y: number, tol: number): BoardObject | null {
  for (let i = objects.length - 1; i >= 0; i--) {
    if (hitTest(objects[i], x, y, tol)) return objects[i]
  }
  return null
}

type Mode =
  | { kind: 'idle' }
  | { kind: 'pending'; start: PointerSample; hitId: Id | null; additive: boolean }
  | { kind: 'move'; start: PointerSample; originals: Map<Id, BoardObject> }
  | { kind: 'resize'; start: PointerSample; handle: Handle; frame: Rect; originals: Map<Id, BoardObject> }
  | { kind: 'endpoint'; start: PointerSample; handle: 'p1' | 'p2'; original: LineObject }
  | { kind: 'marquee'; start: PointerSample; cur: PointerSample; base: Id[] }

export class SelectTool implements Tool {
  cursor = 'default'
  private mode: Mode = { kind: 'idle' }

  active(): boolean {
    return this.mode.kind !== 'idle'
  }

  /** Finds a selection handle under the screen point. */
  handleAt(p: PointerSample, ctx: ToolContext): Handle | null {
    const objs = selected()
    if (!objs.length) return null
    const z = ctx.viewport.zoom
    const near = (hx: number, hy: number) => Math.abs((p.x - hx) * z) <= HANDLE_PX && Math.abs((p.y - hy) * z) <= HANDLE_PX
    if (objs.length === 1 && objs[0].type === 'line') {
      const l = objs[0]
      if (near(l.x1, l.y1)) return 'p1'
      if (near(l.x2, l.y2)) return 'p2'
      return null
    }
    const frame = selectionFrame(objs)
    if (!frame) return null
    for (const [h, hx, hy] of handlePositions(frame)) {
      if (objs.length === 1 && (objs[0].type === 'math' || objs[0].type === 'image') && h.length === 1) continue
      if (near(hx, hy)) return h
    }
    return null
  }

  down(p: PointerSample, ctx: ToolContext): void {
    const doc = useDoc.getState()
    const page = currentPage(doc)
    const handle = this.handleAt(p, ctx)
    if (handle) {
      doc.begin()
      const objs = selected()
      if (handle === 'p1' || handle === 'p2') {
        this.mode = { kind: 'endpoint', start: p, handle, original: objs[0] as LineObject }
      } else {
        this.mode = { kind: 'resize', start: p, handle, frame: selectionFrame(objs)!, originals: new Map(objs.map((o) => [o.id, o])) }
      }
      return
    }
    const tol = 6 / ctx.viewport.zoom
    // Prefer an already-selected object under the pointer (so overlapping picks stay stable).
    const sel = new Set(doc.selection)
    const selectedHit = page.objects.slice().reverse().find((o) => sel.has(o.id) && hitTest(o, p.x, p.y, tol))
    const hit = selectedHit ?? pickObject(page.objects, p.x, p.y, tol)
    if (hit) {
      if (p.shift || p.mod) {
        doc.setSelection(sel.has(hit.id) ? doc.selection.filter((id) => id !== hit.id) : [...doc.selection, hit.id])
      } else if (!sel.has(hit.id)) {
        doc.setSelection([hit.id])
      }
      this.mode = { kind: 'pending', start: p, hitId: hit.id, additive: p.shift || p.mod }
    } else {
      this.mode = { kind: 'marquee', start: p, cur: p, base: p.shift || p.mod ? doc.selection : [] }
      if (!(p.shift || p.mod)) doc.setSelection([])
    }
    ctx.requestOverlay()
  }

  move(p: PointerSample, _s: PointerSample[], ctx: ToolContext): void {
    const doc = useDoc.getState()
    const m = this.mode
    switch (m.kind) {
      case 'pending': {
        if (Math.hypot(p.sx - m.start.sx, p.sy - m.start.sy) < DRAG_PX) return
        const objs = selected()
        if (!objs.length) {
          this.mode = { kind: 'idle' }
          return
        }
        doc.begin()
        this.mode = { kind: 'move', start: m.start, originals: new Map(objs.map((o) => [o.id, o])) }
        this.move(p, _s, ctx)
        return
      }
      case 'move': {
        let dx = p.x - m.start.x
        let dy = p.y - m.start.y
        if (p.shift) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0
          else dx = 0
        }
        doc.transient(
          onPage(ctx.pageId, (page) => {
            page.objects = (page.objects as BoardObject[]).map((o) => {
              const orig = m.originals.get(o.id)
              return orig ? translateObjectData(orig, dx, dy) : o
            }) as typeof page.objects
          })
        )
        ctx.setCursor('move')
        return
      }
      case 'resize': {
        const to = this.resizedFrame(m.frame, m.handle, p, [...m.originals.values()])
        doc.transient(
          onPage(ctx.pageId, (page) => {
            page.objects = (page.objects as BoardObject[]).map((o) => {
              const orig = m.originals.get(o.id)
              return orig ? relayout(scaleObject(orig, m.frame, to)) : o
            }) as typeof page.objects
          })
        )
        return
      }
      case 'endpoint': {
        const l = m.original
        let x = p.x
        let y = p.y
        const ax = m.handle === 'p1' ? l.x2 : l.x1
        const ay = m.handle === 'p1' ? l.y2 : l.y1
        if (p.shift) [x, y] = snapAngle(ax, ay, x, y)
        doc.transient(
          onPage(ctx.pageId, (page) => {
            page.objects = (page.objects as BoardObject[]).map((o) =>
              o.id === l.id ? (m.handle === 'p1' ? { ...l, x1: x, y1: y } : { ...l, x2: x, y2: y }) : o
            ) as typeof page.objects
          })
        )
        return
      }
      case 'marquee': {
        m.cur = p
        const r = rectFromPoints(m.start, p)
        const page = currentPage(doc)
        const ids = page.objects.filter((o) => objectInRect(o, r)).map((o) => o.id)
        const merged = m.base.length ? Array.from(new Set([...m.base, ...ids])) : ids
        doc.setSelection(merged)
        ctx.requestOverlay()
        return
      }
      default:
        return
    }
  }

  private resizedFrame(frame: Rect, handle: Handle, p: PointerSample, objs: BoardObject[]): Rect {
    let x1 = frame.x
    let y1 = frame.y
    let x2 = frame.x + frame.w
    let y2 = frame.y + frame.h
    const minSize = 4
    if (handle.includes('w')) x1 = Math.min(p.x, x2 - minSize)
    if (handle.includes('e')) x2 = Math.max(p.x, x1 + minSize)
    if (handle.includes('n')) y1 = Math.min(p.y, y2 - minSize)
    if (handle.includes('s')) y2 = Math.max(p.y, y1 + minSize)
    const corner = handle.length === 2
    const uniform = corner && (p.shift !== prefersUniformScale(objs))
    if (uniform && frame.w > 0 && frame.h > 0) {
      const sx = (x2 - x1) / frame.w
      const sy = (y2 - y1) / frame.h
      const s = Math.max(sx, sy)
      const w = frame.w * s
      const h = frame.h * s
      if (handle.includes('w')) x1 = x2 - w
      else x2 = x1 + w
      if (handle.includes('n')) y1 = y2 - h
      else y2 = y1 + h
    }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
  }

  up(p: PointerSample, ctx: ToolContext): void {
    const doc = useDoc.getState()
    const m = this.mode
    this.mode = { kind: 'idle' }
    switch (m.kind) {
      case 'pending':
        // A click (no drag) on an object in a multi-selection selects just that object.
        if (!m.additive && m.hitId && doc.selection.length > 1) doc.setSelection([m.hitId])
        break
      case 'move':
        doc.end('Move')
        break
      case 'resize':
        doc.end('Resize')
        break
      case 'endpoint':
        doc.end('Edit line')
        break
      case 'marquee':
        break
    }
    this.hover(p, ctx)
    ctx.requestOverlay()
  }

  cancel(ctx: ToolContext): void {
    if (this.mode.kind === 'move' || this.mode.kind === 'resize' || this.mode.kind === 'endpoint') useDoc.getState().cancel()
    this.mode = { kind: 'idle' }
    ctx.requestOverlay()
  }

  hover(p: PointerSample, ctx: ToolContext): void {
    const handle = this.handleAt(p, ctx)
    if (handle) {
      ctx.setCursor(HANDLE_CURSORS[handle])
      return
    }
    const page = currentPage(useDoc.getState())
    const hit = pickObject(page.objects, p.x, p.y, 6 / ctx.viewport.zoom)
    ctx.setCursor(hit ? 'move' : 'default')
  }

  doubleClick(p: PointerSample, ctx: ToolContext): void {
    const page = currentPage(useDoc.getState())
    const hit = pickObject(page.objects, p.x, p.y, 6 / ctx.viewport.zoom)
    if (!hit) return
    if (hit.type === 'text') beginTextEdit(hit, false)
    else if (hit.type === 'math') useUi.getState().openDialog({ kind: 'math', editId: hit.id })
    else if (hit.type === 'table') {
      let col = 0
      let row = 0
      let acc = hit.x
      for (let c = 0; c < hit.colWidths.length; c++) {
        if (p.x >= acc && p.x < acc + hit.colWidths[c]) col = c
        acc += hit.colWidths[c]
      }
      acc = hit.y
      for (let r = 0; r < hit.rowHeights.length; r++) {
        if (p.y >= acc && p.y < acc + hit.rowHeights[r]) row = r
        acc += hit.rowHeights[r]
      }
      useDoc.getState().setSelection([hit.id])
      useUi.getState().set({ cellEdit: { tableId: hit.id, row, col } })
    }
  }

  drawOverlay(g: CanvasRenderingContext2D, zoom: number): void {
    if (this.mode.kind !== 'marquee') return
    const r = rectFromPoints(this.mode.start, this.mode.cur)
    g.save()
    g.fillStyle = 'rgba(15,139,120,0.08)'
    g.strokeStyle = 'rgba(15,139,120,0.9)'
    g.lineWidth = 1 / zoom
    g.setLineDash([4 / zoom, 3 / zoom])
    g.fillRect(r.x, r.y, r.w, r.h)
    g.strokeRect(r.x, r.y, r.w, r.h)
    g.restore()
  }
}
