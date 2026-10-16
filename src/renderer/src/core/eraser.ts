import { newId } from './document'
import { distToSegment, objectBounds, rectContainsPoint, touchesCircle } from './geometry'
import type { BoardObject, StrokeObject } from './model'

export type EraserMode = 'partial' | 'object'

/** Object types the eraser may touch. Text, equations, images and tables are left alone. */
export function isErasable(o: BoardObject, mode: EraserMode): boolean {
  if (o.type === 'stroke') return true
  return mode === 'object' && (o.type === 'shape' || o.type === 'line' || o.type === 'polygon')
}

/** Inserts interpolated points so no segment is longer than `maxStep`. */
export function densify(points: number[], maxStep: number): number[] {
  if (points.length <= 3) return points
  const out: number[] = [points[0], points[1], points[2]]
  for (let i = 3; i < points.length; i += 3) {
    const ax = points[i - 3]
    const ay = points[i - 2]
    const ap = points[i - 1]
    const bx = points[i]
    const by = points[i + 1]
    const bp = points[i + 2]
    const len = Math.hypot(bx - ax, by - ay)
    const steps = Math.floor(len / maxStep)
    for (let s = 1; s <= steps; s++) {
      const t = s / (steps + 1)
      out.push(ax + (bx - ax) * t, ay + (by - ay) * t, ap + (bp - ap) * t)
    }
    out.push(bx, by, bp)
  }
  return out
}

/**
 * Splits a stroke where it passes within `radius` of the eraser segment
 * (ax,ay)→(bx,by). Returns null when the stroke is untouched, otherwise the
 * surviving fragments (possibly empty). The first fragment keeps the id.
 */
export function eraseStrokeSegment(stroke: StrokeObject, ax: number, ay: number, bx: number, by: number, radius: number): StrokeObject[] | null {
  const reach = radius + stroke.width / 2
  const b = objectBounds(stroke)
  const minX = Math.min(ax, bx)
  const minY = Math.min(ay, by)
  const box = { x: minX, y: minY, w: Math.abs(bx - ax), h: Math.abs(by - ay) }
  if (!(b.x <= box.x + box.w + reach && box.x - reach <= b.x + b.w && b.y <= box.y + box.h + reach && box.y - reach <= b.y + b.h)) {
    return null
  }
  const pts = densify(stroke.points, Math.max(1, radius / 2))
  const n = pts.length / 3
  const keep: boolean[] = new Array(n)
  let anyRemoved = false
  for (let i = 0; i < n; i++) {
    const d = distToSegment(pts[i * 3], pts[i * 3 + 1], ax, ay, bx, by)
    keep[i] = d > reach
    if (!keep[i]) anyRemoved = true
  }
  if (!anyRemoved) return null

  const fragments: StrokeObject[] = []
  let run: number[] = []
  const flush = () => {
    // Single leftover points become specks; drop them unless the original was a dot.
    if (run.length >= 6) {
      fragments.push({ ...stroke, id: fragments.length === 0 ? stroke.id : newId('o'), points: run })
    }
    run = []
  }
  for (let i = 0; i < n; i++) {
    if (keep[i]) run.push(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2])
    else flush()
  }
  flush()
  return fragments
}

/**
 * Applies one eraser movement to a list of objects. Returns the new list, or
 * the same array instance when nothing changed.
 */
export function applyEraser(
  objects: BoardObject[],
  mode: EraserMode,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  radius: number
): BoardObject[] {
  let changed = false
  const out: BoardObject[] = []
  for (const o of objects) {
    if (!isErasable(o, mode)) {
      out.push(o)
      continue
    }
    if (mode === 'object') {
      // Sample along the movement so fast swipes don't skip objects.
      const len = Math.hypot(bx - ax, by - ay)
      const steps = Math.max(1, Math.ceil(len / Math.max(1, radius)))
      let hit = false
      for (let s = 0; s <= steps && !hit; s++) {
        const t = s / steps
        hit = touchesCircle(o, ax + (bx - ax) * t, ay + (by - ay) * t, radius)
      }
      if (hit) changed = true
      else out.push(o)
      continue
    }
    if (o.type !== 'stroke') {
      out.push(o)
      continue
    }
    const frags = eraseStrokeSegment(o, ax, ay, bx, by, radius)
    if (frags === null) out.push(o)
    else {
      changed = true
      out.push(...frags)
    }
  }
  return changed ? out : objects
}

/** Whether a point is near enough to an object's bounds to possibly be erased (cheap pre-check). */
export function nearBounds(o: BoardObject, x: number, y: number, r: number): boolean {
  return rectContainsPoint(objectBounds(o), x, y, r)
}
