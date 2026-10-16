import { newId } from '../core/document'
import type { LineObject, PolygonObject, ShapeObject } from '../core/model'
import { drawLine, dashPattern, shapePath } from '../core/render'
import { snapAngle } from '../core/strokes'
import { onPage, useDoc } from '../state/doc'
import { useSettings } from '../state/settings'
import type { PointerSample, Tool, ToolContext } from './types'

/**
 * Computes the box for a click-and-drag shape. Works in any drag direction;
 * Shift keeps it square/circular, Alt draws from the centre.
 */
export function dragBox(sx: number, sy: number, ex: number, ey: number, square: boolean, fromCenter: boolean): { x: number; y: number; w: number; h: number } {
  let dx = ex - sx
  let dy = ey - sy
  if (square) {
    const m = Math.max(Math.abs(dx), Math.abs(dy))
    dx = Math.sign(dx || 1) * m
    dy = Math.sign(dy || 1) * m
  }
  if (fromCenter) return { x: sx - Math.abs(dx), y: sy - Math.abs(dy), w: Math.abs(dx) * 2, h: Math.abs(dy) * 2 }
  return { x: Math.min(sx, sx + dx), y: Math.min(sy, sy + dy), w: Math.abs(dx), h: Math.abs(dy) }
}

const CLICK_PX = 4

export class ShapeTool implements Tool {
  readonly cursor = 'crosshair'
  private start: PointerSample | null = null
  private cur: PointerSample | null = null

  active(): boolean {
    return !!this.start
  }

  private build(zoom: number): ShapeObject | null {
    if (!this.start || !this.cur) return null
    const st = useSettings.getState().settings.drawing.shape
    const dragged = Math.hypot(this.cur.sx - this.start.sx, this.cur.sy - this.start.sy) > CLICK_PX
    // A plain click places a default-sized shape.
    const box = dragged
      ? dragBox(this.start.x, this.start.y, this.cur.x, this.cur.y, this.cur.shift, this.cur.alt)
      : { x: this.start.x - 100, y: this.start.y - 75, w: 200, h: st.kind === 'ellipse' || st.kind === 'rect' ? 150 : 170 }
    void zoom
    return {
      id: newId('o'),
      type: 'shape',
      kind: st.kind,
      ...box,
      stroke: st.stroke,
      fill: st.fill,
      strokeWidth: st.strokeWidth,
      dash: st.dash,
      // Dragging leftwards/upwards mirrors asymmetric shapes such as the right triangle.
      flipX: dragged && this.cur.x < this.start.x && !this.cur.alt,
      flipY: false
    }
  }

  down(p: PointerSample, ctx: ToolContext): void {
    this.start = p
    this.cur = p
    ctx.requestOverlay()
  }
  move(p: PointerSample, _s: PointerSample[], ctx: ToolContext): void {
    if (!this.start) return
    this.cur = p
    ctx.requestOverlay()
  }
  up(p: PointerSample, ctx: ToolContext): void {
    if (!this.start) return
    this.cur = p
    const shape = this.build(ctx.viewport.zoom)
    this.start = this.cur = null
    if (shape && shape.w >= 1 && shape.h >= 1) {
      shape.x = Math.round(shape.x * 100) / 100
      shape.y = Math.round(shape.y * 100) / 100
      useDoc.getState().commit(
        'Add shape',
        onPage(ctx.pageId, (page) => {
          page.objects.push(shape)
        })
      )
    }
    ctx.requestOverlay()
  }
  cancel(ctx: ToolContext): void {
    this.start = this.cur = null
    ctx.requestOverlay()
  }
  drawOverlay(g: CanvasRenderingContext2D, zoom: number): void {
    const s = this.build(zoom)
    if (!s || !this.cur || !this.start) return
    if (Math.hypot(this.cur.sx - this.start.sx, this.cur.sy - this.start.sy) <= CLICK_PX) return
    const path = shapePath(s)
    g.save()
    if (s.fill) {
      g.fillStyle = s.fill
      g.fill(path)
    }
    if (s.strokeWidth > 0) {
      g.strokeStyle = s.stroke
      g.lineWidth = s.strokeWidth
      g.lineJoin = 'round'
      g.lineCap = 'round'
      g.setLineDash(dashPattern(s.dash, s.strokeWidth))
      g.stroke(path)
    }
    // Size readout helps when drawing precise figures.
    g.setLineDash([])
    g.font = `${12 / zoom}px Inter, sans-serif`
    g.fillStyle = 'rgba(15,139,120,0.95)'
    g.fillText(`${Math.round(s.w)} × ${Math.round(s.h)}`, s.x + s.w + 8 / zoom, s.y + s.h + 14 / zoom)
    g.restore()
  }
}

export class LineTool implements Tool {
  readonly cursor = 'crosshair'
  private start: PointerSample | null = null
  private cur: PointerSample | null = null

  active(): boolean {
    return !!this.start
  }

  private build(): LineObject | null {
    if (!this.start || !this.cur) return null
    const st = useSettings.getState().settings.drawing.line
    let x2 = this.cur.x
    let y2 = this.cur.y
    const dragged = Math.hypot(this.cur.sx - this.start.sx, this.cur.sy - this.start.sy) > CLICK_PX
    if (!dragged) {
      x2 = this.start.x + 200
      y2 = this.start.y
    } else if (this.cur.shift) {
      ;[x2, y2] = snapAngle(this.start.x, this.start.y, x2, y2)
    }
    return {
      id: newId('o'),
      type: 'line',
      x1: this.start.x,
      y1: this.start.y,
      x2,
      y2,
      stroke: st.stroke,
      strokeWidth: st.strokeWidth,
      dash: st.dash,
      startCap: st.startCap,
      endCap: st.endCap
    }
  }

  down(p: PointerSample, ctx: ToolContext): void {
    this.start = p
    this.cur = p
    ctx.requestOverlay()
  }
  move(p: PointerSample, _s: PointerSample[], ctx: ToolContext): void {
    if (!this.start) return
    this.cur = p
    ctx.requestOverlay()
  }
  up(p: PointerSample, ctx: ToolContext): void {
    if (!this.start) return
    this.cur = p
    const line = this.build()
    this.start = this.cur = null
    if (line) {
      useDoc.getState().commit(
        'Add line',
        onPage(ctx.pageId, (page) => {
          page.objects.push(line)
        })
      )
    }
    ctx.requestOverlay()
  }
  cancel(ctx: ToolContext): void {
    this.start = this.cur = null
    ctx.requestOverlay()
  }
  drawOverlay(g: CanvasRenderingContext2D): void {
    const l = this.build()
    if (!l || !this.cur || !this.start) return
    if (Math.hypot(this.cur.sx - this.start.sx, this.cur.sy - this.start.sy) <= CLICK_PX) return
    g.save()
    drawLine(g, l)
    g.restore()
  }
}

/** Click to add vertices; click the first vertex, double-click or press Enter to finish. */
export class PolygonTool implements Tool {
  readonly cursor = 'crosshair'
  private pts: number[] = []
  private hoverPt: { x: number; y: number } | null = null
  private zoom = 1

  active(): boolean {
    return this.pts.length > 0
  }

  private finish(ctx: ToolContext, closed: boolean): void {
    const pts = this.pts
    this.pts = []
    this.hoverPt = null
    if (pts.length >= 4) {
      const st = useSettings.getState().settings.drawing.shape
      const poly: PolygonObject = {
        id: newId('o'),
        type: 'polygon',
        points: pts.map((v) => Math.round(v * 100) / 100),
        closed: closed && pts.length >= 6,
        stroke: st.stroke,
        fill: st.fill,
        strokeWidth: Math.max(1, st.strokeWidth),
        dash: st.dash
      }
      useDoc.getState().commit(
        'Add polygon',
        onPage(ctx.pageId, (page) => {
          page.objects.push(poly)
        })
      )
    }
    ctx.requestOverlay()
  }

  down(p: PointerSample, ctx: ToolContext): void {
    this.zoom = ctx.viewport.zoom
    let x = p.x
    let y = p.y
    if (this.pts.length >= 2 && p.shift) {
      const n = this.pts.length
      ;[x, y] = snapAngle(this.pts[n - 2], this.pts[n - 1], x, y)
    }
    if (this.pts.length >= 6 && Math.hypot(x - this.pts[0], y - this.pts[1]) * ctx.viewport.zoom < 12) {
      this.finish(ctx, true)
      return
    }
    this.pts.push(x, y)
    ctx.requestOverlay()
  }
  move(p: PointerSample, _s: PointerSample[], ctx: ToolContext): void {
    this.hover(p, ctx)
  }
  hover(p: PointerSample, ctx: ToolContext): void {
    this.zoom = ctx.viewport.zoom
    let x = p.x
    let y = p.y
    if (this.pts.length >= 2 && p.shift) {
      const n = this.pts.length
      ;[x, y] = snapAngle(this.pts[n - 2], this.pts[n - 1], x, y)
    }
    this.hoverPt = { x, y }
    if (this.pts.length) ctx.requestOverlay()
  }
  up(): void {}
  doubleClick(_p: PointerSample, ctx: ToolContext): void {
    // The double-click's second press added a duplicate vertex; drop it.
    if (this.pts.length >= 4) this.pts.splice(-2, 2)
    this.finish(ctx, true)
  }
  key(e: KeyboardEvent, ctx: ToolContext): boolean {
    if (!this.pts.length) return false
    if (e.key === 'Enter') {
      this.finish(ctx, true)
      return true
    }
    if (e.key === 'Escape') {
      this.cancel(ctx)
      return true
    }
    if (e.key === 'Backspace') {
      this.pts.splice(-2, 2)
      ctx.requestOverlay()
      return true
    }
    return false
  }
  cancel(ctx: ToolContext): void {
    this.pts = []
    this.hoverPt = null
    ctx.requestOverlay()
  }
  drawOverlay(g: CanvasRenderingContext2D, zoom: number): void {
    if (!this.pts.length) return
    const st = useSettings.getState().settings.drawing.shape
    g.save()
    g.strokeStyle = st.stroke
    g.lineWidth = Math.max(1, st.strokeWidth)
    g.lineJoin = 'round'
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(this.pts[0], this.pts[1])
    for (let i = 2; i < this.pts.length; i += 2) g.lineTo(this.pts[i], this.pts[i + 1])
    if (this.hoverPt) g.lineTo(this.hoverPt.x, this.hoverPt.y)
    g.stroke()
    g.fillStyle = '#0F8B78'
    for (let i = 0; i < this.pts.length; i += 2) {
      g.beginPath()
      g.arc(this.pts[i], this.pts[i + 1], (i === 0 ? 6 : 4) / zoom, 0, Math.PI * 2)
      g.fill()
    }
    g.restore()
    void this.zoom
  }
}
