import { newId } from '../core/document'
import { applyEraser } from '../core/eraser'
import type { BoardObject, StrokeObject } from '../core/model'
import { drawStroke, penOutline, outlineToPath, centerlinePath, projectOntoLine, snapAngle, usesOutline } from '../core/strokes'
import { onPage, useDoc } from '../state/doc'
import { useSettings } from '../state/settings'
import { useUi } from '../state/ui'
import type { PointerSample, Tool, ToolContext } from './types'

/** How close (screen px) the pen must start to the ruler edge to draw along it. */
const RULER_SNAP_PX = 28

export function rulerEdge(): { x: number; y: number; angle: number; length: number } | null {
  const ui = useUi.getState()
  if (!ui.widgets.includes('ruler')) return null
  return ui.ruler
}

/** Pen and highlighter. */
export class InkTool implements Tool {
  readonly cursor = 'crosshair'
  private points: number[] = []
  private drawing = false
  private realPressure = false
  private snap: { ax: number; ay: number; angle: number } | null = null

  constructor(private kind: 'pen' | 'highlighter') {}

  active(): boolean {
    return this.drawing
  }

  private pressureOf(p: PointerSample): number {
    return this.realPressure ? Math.max(0.05, Math.min(1, p.pressure)) : 0.5
  }

  private place(p: PointerSample): [number, number] {
    if (this.snap) return projectOntoLine(p.x, p.y, this.snap.ax, this.snap.ay, this.snap.angle)
    return [p.x, p.y]
  }

  down(p: PointerSample, ctx: ToolContext): void {
    const settings = useSettings.getState().settings
    this.drawing = true
    this.realPressure = this.kind === 'pen' && p.pointerType === 'pen' && settings.pressure && p.pressure > 0
    this.snap = null
    const ruler = rulerEdge()
    if (ruler) {
      // Distance from the pointer to the ruler's drawing edge (its top edge).
      const [px, py] = projectOntoLine(p.x, p.y, ruler.x, ruler.y, ruler.angle)
      const along = (px - ruler.x) * Math.cos(ruler.angle) + (py - ruler.y) * Math.sin(ruler.angle)
      const dist = Math.hypot(p.x - px, p.y - py) * ctx.viewport.zoom
      if (dist < RULER_SNAP_PX && along > -20 && along < ruler.length + 20) {
        this.snap = { ax: ruler.x, ay: ruler.y, angle: ruler.angle }
      }
    }
    const [x, y] = this.place(p)
    this.points = [x, y, this.pressureOf(p)]
    ctx.requestOverlay()
  }

  move(p: PointerSample, samples: PointerSample[], ctx: ToolContext): void {
    if (!this.drawing) return
    if (p.shift && !this.snap) {
      // Straight line from the first point, snapped to 15° steps.
      const [x, y] = snapAngle(this.points[0], this.points[1], p.x, p.y)
      this.points = [this.points[0], this.points[1], this.points[2], x, y, this.pressureOf(p)]
      ctx.requestOverlay()
      return
    }
    const minStep = 0.6 / ctx.viewport.zoom
    for (const s of samples) {
      const [x, y] = this.place(s)
      const n = this.points.length
      const lx = this.points[n - 3]
      const ly = this.points[n - 2]
      if (Math.hypot(x - lx, y - ly) < minStep) continue
      this.points.push(x, y, this.pressureOf(s))
    }
    ctx.requestOverlay()
  }

  up(p: PointerSample, ctx: ToolContext): void {
    if (!this.drawing) return
    this.move(p, [p], ctx)
    this.drawing = false
    if (this.points.length === 3) this.points.push(this.points[0] + 0.01, this.points[1], this.points[2])
    const stroke = this.buildStroke()
    stroke.points = stroke.points.map((v) => Math.round(v * 100) / 100)
    this.points = []
    const doc = useDoc.getState()
    doc.commit(
      this.kind === 'pen' ? 'Draw' : 'Highlight',
      onPage(ctx.pageId, (page) => {
        page.objects.push(stroke)
      })
    )
    ctx.requestOverlay()
  }

  cancel(ctx: ToolContext): void {
    this.drawing = false
    this.points = []
    ctx.requestOverlay()
  }

  buildStroke(): StrokeObject {
    const d = useSettings.getState().settings.drawing
    const isPen = this.kind === 'pen'
    return {
      id: newId('o'),
      type: 'stroke',
      tool: this.kind,
      style: isPen ? d.pen.style : 'marker',
      color: isPen ? d.pen.color : d.highlighter.color,
      width: isPen ? d.pen.width : d.highlighter.width,
      opacity: isPen ? 1 : 0.42,
      points: this.points.slice(),
      pressure: this.realPressure
    }
  }

  drawOverlay(g: CanvasRenderingContext2D): void {
    if (!this.drawing || this.points.length < 3) return
    const s = this.buildStroke()
    const path = usesOutline(s) ? outlineToPath(penOutline(s, false)) : centerlinePath(s.points)
    drawStroke(g, s, false, path)
  }
}

/** Stroke eraser (removes whole objects) and partial eraser (splits ink). */
export class EraserTool implements Tool {
  readonly cursor = 'none'
  private erasing = false
  private last: { x: number; y: number } | null = null
  private hoverPos: { x: number; y: number } | null = null

  active(): boolean {
    return this.erasing
  }

  /** Eraser size is set in screen pixels so it feels the same at any zoom. */
  private radius(zoom: number): number {
    return useSettings.getState().settings.drawing.eraser.size / 2 / zoom
  }

  private apply(ax: number, ay: number, bx: number, by: number, ctx: ToolContext): void {
    const mode = useSettings.getState().settings.drawing.eraser.mode
    const r = this.radius(ctx.viewport.zoom)
    useDoc.getState().transient(
      onPage(ctx.pageId, (page) => {
        const next = applyEraser(page.objects as BoardObject[], mode, ax, ay, bx, by, r)
        if (next !== (page.objects as BoardObject[])) page.objects = next as typeof page.objects
      })
    )
  }

  down(p: PointerSample, ctx: ToolContext): void {
    this.erasing = true
    useDoc.getState().begin()
    this.last = { x: p.x, y: p.y }
    this.hoverPos = this.last
    this.apply(p.x, p.y, p.x, p.y, ctx)
    ctx.requestOverlay()
  }

  move(p: PointerSample, samples: PointerSample[], ctx: ToolContext): void {
    this.hoverPos = { x: p.x, y: p.y }
    if (this.erasing && this.last) {
      for (const s of samples) {
        this.apply(this.last.x, this.last.y, s.x, s.y, ctx)
        this.last = { x: s.x, y: s.y }
      }
    }
    ctx.requestOverlay()
  }

  hover(p: PointerSample, ctx: ToolContext): void {
    this.hoverPos = { x: p.x, y: p.y }
    ctx.requestOverlay()
  }

  up(_p: PointerSample, ctx: ToolContext): void {
    if (!this.erasing) return
    this.erasing = false
    this.last = null
    useDoc.getState().end('Erase')
    ctx.requestOverlay()
  }

  cancel(ctx: ToolContext): void {
    if (this.erasing) useDoc.getState().end('Erase')
    this.erasing = false
    this.last = null
    this.hoverPos = null
    ctx.requestOverlay()
  }

  leave(ctx: ToolContext): void {
    this.hoverPos = null
    ctx.requestOverlay()
  }

  drawOverlay(g: CanvasRenderingContext2D, zoom: number): void {
    if (!this.hoverPos) return
    const r = this.radius(zoom)
    g.save()
    g.beginPath()
    g.arc(this.hoverPos.x, this.hoverPos.y, r, 0, Math.PI * 2)
    g.fillStyle = this.erasing ? 'rgba(15,139,120,0.14)' : 'rgba(255,255,255,0.35)'
    g.fill()
    g.lineWidth = 1.5 / zoom
    g.strokeStyle = 'rgba(30,34,40,0.75)'
    g.stroke()
    g.setLineDash([3 / zoom, 3 / zoom])
    g.strokeStyle = 'rgba(255,255,255,0.9)'
    g.stroke()
    g.restore()
  }
}

/** A presenter's pointer with a short fading trail. Never modifies the lesson. */
export class LaserTool implements Tool {
  readonly cursor = 'none'
  private trail: { x: number; y: number; t: number }[] = []
  private pos: { x: number; y: number } | null = null
  private down_ = false

  active(): boolean {
    return this.down_
  }

  private add(p: PointerSample, ctx: ToolContext): void {
    this.pos = { x: p.x, y: p.y }
    if (this.down_) this.trail.push({ x: p.x, y: p.y, t: performance.now() })
    ctx.requestOverlay()
  }

  down(p: PointerSample, ctx: ToolContext): void {
    this.down_ = true
    this.add(p, ctx)
  }
  move(p: PointerSample, _s: PointerSample[], ctx: ToolContext): void {
    this.add(p, ctx)
  }
  hover(p: PointerSample, ctx: ToolContext): void {
    this.add(p, ctx)
  }
  up(_p: PointerSample, ctx: ToolContext): void {
    this.down_ = false
    ctx.requestOverlay()
  }
  cancel(ctx: ToolContext): void {
    this.down_ = false
    this.trail = []
    this.pos = null
    ctx.requestOverlay()
  }

  animating(): boolean {
    return this.trail.length > 0
  }

  drawOverlay(g: CanvasRenderingContext2D, zoom: number, now: number): void {
    const life = 700
    this.trail = this.trail.filter((p) => now - p.t < life)
    g.save()
    g.lineCap = 'round'
    g.lineJoin = 'round'
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1]
      const b = this.trail[i]
      const k = 1 - (now - b.t) / life
      g.strokeStyle = `rgba(255, 40, 60, ${0.75 * k})`
      g.lineWidth = (3 + 5 * k) / zoom
      g.beginPath()
      g.moveTo(a.x, a.y)
      g.lineTo(b.x, b.y)
      g.stroke()
    }
    if (this.pos) {
      const r = 7 / zoom
      const grad = g.createRadialGradient(this.pos.x, this.pos.y, 0, this.pos.x, this.pos.y, r * 2.4)
      grad.addColorStop(0, 'rgba(255,60,70,1)')
      grad.addColorStop(0.4, 'rgba(255,40,60,0.85)')
      grad.addColorStop(1, 'rgba(255,40,60,0)')
      g.fillStyle = grad
      g.beginPath()
      g.arc(this.pos.x, this.pos.y, r * 2.4, 0, Math.PI * 2)
      g.fill()
    }
    g.restore()
  }
}
