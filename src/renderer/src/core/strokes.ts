import { getStroke } from 'perfect-freehand'
import type { StrokeObject } from './model'

/**
 * Stroke geometry. Pen strokes become filled outlines (pressure-aware via
 * perfect-freehand); markers, dashed pens and highlighters become smoothed
 * centre-lines stroked with a constant width.
 */

export function pressureOptions(s: Pick<StrokeObject, 'width' | 'pressure'>, last: boolean) {
  return {
    size: s.width,
    // Without real pressure data, keep the line even rather than faking it from speed.
    thinning: s.pressure ? 0.6 : 0,
    smoothing: 0.55,
    streamline: 0.4,
    simulatePressure: false,
    easing: (t: number) => t,
    start: { taper: 0, cap: true },
    end: { taper: 0, cap: true },
    last
  }
}

/** Outline polygon for a pressure pen stroke, as [x, y] pairs. */
export function penOutline(s: Pick<StrokeObject, 'points' | 'width' | 'pressure'>, last = true): number[][] {
  const input: number[][] = []
  for (let i = 0; i < s.points.length; i += 3) {
    input.push([s.points[i], s.points[i + 1], s.pressure ? s.points[i + 2] : 0.5])
  }
  return getStroke(input, pressureOptions(s, last))
}

export function usesOutline(s: Pick<StrokeObject, 'tool' | 'style'>): boolean {
  return s.tool === 'pen' && s.style === 'pen'
}

export function outlineToPath(outline: number[][]): Path2D {
  const path = new Path2D()
  if (outline.length < 2) return path
  path.moveTo(outline[0][0], outline[0][1])
  for (let i = 1; i < outline.length - 1; i++) {
    const [x0, y0] = outline[i]
    const [x1, y1] = outline[i + 1]
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
  }
  const last = outline[outline.length - 1]
  path.lineTo(last[0], last[1])
  path.closePath()
  return path
}

/** Smoothed centre-line through the points using quadratic midpoints. */
export function centerlinePath(points: number[]): Path2D {
  const path = new Path2D()
  const n = points.length / 3
  if (n === 0) return path
  path.moveTo(points[0], points[1])
  if (n === 1) {
    path.lineTo(points[0] + 0.01, points[1])
    return path
  }
  if (n === 2) {
    path.lineTo(points[3], points[4])
    return path
  }
  for (let i = 1; i < n - 1; i++) {
    const x0 = points[i * 3]
    const y0 = points[i * 3 + 1]
    const x1 = points[(i + 1) * 3]
    const y1 = points[(i + 1) * 3 + 1]
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
  }
  path.lineTo(points[(n - 1) * 3], points[(n - 1) * 3 + 1])
  return path
}

const pathCache = new WeakMap<StrokeObject, Path2D>()

export function strokePath(s: StrokeObject): Path2D {
  let p = pathCache.get(s)
  if (!p) {
    p = usesOutline(s) ? outlineToPath(penOutline(s)) : centerlinePath(s.points)
    pathCache.set(s, p)
  }
  return p
}

export function drawStroke(ctx: CanvasRenderingContext2D, s: StrokeObject, multiply = true, path: Path2D = strokePath(s)): void {
  ctx.save()
  ctx.globalAlpha = s.opacity
  if (s.tool === 'highlighter' && multiply) {
    // Multiply keeps text and ink beneath a highlighter readable (light pages only).
    ctx.globalCompositeOperation = 'multiply'
  }
  if (usesOutline(s)) {
    ctx.fillStyle = s.color
    ctx.fill(path)
  } else {
    ctx.strokeStyle = s.color
    ctx.lineWidth = s.width
    ctx.lineJoin = 'round'
    ctx.lineCap = s.tool === 'highlighter' ? 'square' : 'round'
    if (s.style === 'dashed') ctx.setLineDash([s.width * 2.5, s.width * 2])
    ctx.stroke(path)
  }
  ctx.restore()
}

/**
 * Projects a point onto the line through (ax, ay) with direction angle `angle`.
 * Used for drawing straight along the ruler.
 */
export function projectOntoLine(px: number, py: number, ax: number, ay: number, angle: number): [number, number] {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const t = (px - ax) * dx + (py - ay) * dy
  return [ax + dx * t, ay + dy * t]
}

/** Snaps a straight segment from (x0,y0) to (x,y) to 15° increments. */
export function snapAngle(x0: number, y0: number, x: number, y: number): [number, number] {
  const len = Math.hypot(x - x0, y - y0)
  const step = Math.PI / 12
  const a = Math.round(Math.atan2(y - y0, x - x0) / step) * step
  return [x0 + Math.cos(a) * len, y0 + Math.sin(a) * len]
}
