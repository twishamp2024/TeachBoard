import type { BoardObject, ShapeKind, ShapeObject, TableObject } from './model'

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

// ---------------------------------------------------------------------------
// Rect helpers

export function rectFromPoints(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
}

export function unionRects(rects: Rect[]): Rect | null {
  if (!rects.length) return null
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const r of rects) {
    x1 = Math.min(x1, r.x)
    y1 = Math.min(y1, r.y)
    x2 = Math.max(x2, r.x + r.w)
    y2 = Math.max(y2, r.y + r.h)
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h
}

export function rectContainsPoint(r: Rect, x: number, y: number, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad
}

export function expandRect(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 }
}

// ---------------------------------------------------------------------------
// Distances

export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

/** Minimum distance between segments AB and CD. */
export function segmentDistance(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
  if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0
  return Math.min(
    distToSegment(ax, ay, cx, cy, dx, dy),
    distToSegment(bx, by, cx, cy, dx, dy),
    distToSegment(cx, cy, ax, ay, bx, by),
    distToSegment(dx, dy, ax, ay, bx, by)
  )
}

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
}

export function segmentsIntersect(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const d1 = orient(cx, cy, dx, dy, ax, ay)
  const d2 = orient(cx, cy, dx, dy, bx, by)
  const d3 = orient(ax, ay, bx, by, cx, cy)
  const d4 = orient(ax, ay, bx, by, dx, dy)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/** Distance from a point to a polyline given as flat coordinates with `stride` values per vertex. */
export function distToPolyline(px: number, py: number, pts: number[], stride: number, closed = false): number {
  const n = Math.floor(pts.length / stride)
  if (n === 0) return Infinity
  if (n === 1) return Math.hypot(px - pts[0], py - pts[1])
  let best = Infinity
  for (let i = 0; i < n - 1; i++) {
    const d = distToSegment(px, py, pts[i * stride], pts[i * stride + 1], pts[(i + 1) * stride], pts[(i + 1) * stride + 1])
    if (d < best) best = d
  }
  if (closed) {
    const d = distToSegment(px, py, pts[(n - 1) * stride], pts[(n - 1) * stride + 1], pts[0], pts[1])
    if (d < best) best = d
  }
  return best
}

export function pointInPolygon(px: number, py: number, pts: number[]): boolean {
  let inside = false
  const n = pts.length / 2
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2]
    const yi = pts[i * 2 + 1]
    const xj = pts[j * 2]
    const yj = pts[j * 2 + 1]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// ---------------------------------------------------------------------------
// Shapes

const unitCache = new Map<string, number[]>()

function regularUnit(sides: number, startDeg: number, innerRatio = 0): number[] {
  const key = `${sides}:${startDeg}:${innerRatio}`
  const cached = unitCache.get(key)
  if (cached) return cached
  const raw: number[] = []
  const count = innerRatio ? sides * 2 : sides
  for (let i = 0; i < count; i++) {
    const r = innerRatio && i % 2 === 1 ? innerRatio : 1
    const a = ((startDeg + (360 / count) * i) * Math.PI) / 180
    raw.push(Math.cos(a) * r, Math.sin(a) * r)
  }
  // Normalise to fill the unit box [0,1]×[0,1].
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < raw.length; i += 2) {
    minX = Math.min(minX, raw[i])
    maxX = Math.max(maxX, raw[i])
    minY = Math.min(minY, raw[i + 1])
    maxY = Math.max(maxY, raw[i + 1])
  }
  const out = raw.map((v, i) => (i % 2 === 0 ? (v - minX) / (maxX - minX) : (v - minY) / (maxY - minY)))
  unitCache.set(key, out)
  return out
}

/** Vertices in the unit box for polygonal shape kinds; null for curved kinds. */
export function shapeUnitPolygon(kind: ShapeKind): number[] | null {
  switch (kind) {
    case 'rect':
      return [0, 0, 1, 0, 1, 1, 0, 1]
    case 'triangle':
      return [0.5, 0, 1, 1, 0, 1]
    case 'rightTriangle':
      return [0, 0, 1, 1, 0, 1]
    case 'diamond':
      return [0.5, 0, 1, 0.5, 0.5, 1, 0, 0.5]
    case 'parallelogram':
      return [0.25, 0, 1, 0, 0.75, 1, 0, 1]
    case 'trapezoid':
      return [0.2, 0, 0.8, 0, 1, 1, 0, 1]
    case 'pentagon':
      return regularUnit(5, -90)
    case 'hexagon':
      return regularUnit(6, 0)
    case 'star':
      return regularUnit(5, -90, 0.42)
    default:
      return null
  }
}

export function roundRectRadius(w: number, h: number): number {
  return Math.min(Math.abs(w), Math.abs(h)) * 0.18
}

/** Outline vertices of a shape in page coordinates (curves are approximated). */
export function shapeOutline(s: Pick<ShapeObject, 'kind' | 'x' | 'y' | 'w' | 'h' | 'flipX' | 'flipY'>): number[] {
  const { x, y, w, h } = s
  const unit = shapeUnitPolygon(s.kind)
  let pts: number[]
  if (unit) {
    pts = unit.slice()
  } else if (s.kind === 'ellipse') {
    pts = []
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2
      pts.push(0.5 + Math.cos(a) / 2, 0.5 + Math.sin(a) / 2)
    }
  } else {
    // roundRect
    const r = roundRectRadius(w, h)
    const rx = w ? r / w : 0
    const ry = h ? r / h : 0
    pts = []
    const corners: [number, number, number][] = [
      [1 - rx, ry, -90],
      [1 - rx, 1 - ry, 0],
      [rx, 1 - ry, 90],
      [rx, ry, 180]
    ]
    for (const [cx, cy, start] of corners) {
      for (let i = 0; i <= 6; i++) {
        const a = ((start + i * 15) * Math.PI) / 180
        pts.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry)
      }
    }
  }
  for (let i = 0; i < pts.length; i += 2) {
    const ux = s.flipX ? 1 - pts[i] : pts[i]
    const uy = s.flipY ? 1 - pts[i + 1] : pts[i + 1]
    pts[i] = x + ux * w
    pts[i + 1] = y + uy * h
  }
  return pts
}

export function arrowSize(strokeWidth: number): number {
  return Math.max(12, strokeWidth * 3.6)
}

// ---------------------------------------------------------------------------
// Bounds

export function tableSize(t: Pick<TableObject, 'colWidths' | 'rowHeights'>): { w: number; h: number } {
  return { w: t.colWidths.reduce((a, b) => a + b, 0), h: t.rowHeights.reduce((a, b) => a + b, 0) }
}

const boundsCache = new WeakMap<BoardObject, Rect>()

export function objectBounds(o: BoardObject): Rect {
  const cached = boundsCache.get(o)
  if (cached) return cached
  const r = computeBounds(o)
  boundsCache.set(o, r)
  return r
}

function computeBounds(o: BoardObject): Rect {
  switch (o.type) {
    case 'stroke': {
      let x1 = Infinity
      let y1 = Infinity
      let x2 = -Infinity
      let y2 = -Infinity
      for (let i = 0; i < o.points.length; i += 3) {
        x1 = Math.min(x1, o.points[i])
        x2 = Math.max(x2, o.points[i])
        y1 = Math.min(y1, o.points[i + 1])
        y2 = Math.max(y2, o.points[i + 1])
      }
      const pad = o.width / 2
      return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 }
    }
    case 'polygon': {
      let x1 = Infinity
      let y1 = Infinity
      let x2 = -Infinity
      let y2 = -Infinity
      for (let i = 0; i < o.points.length; i += 2) {
        x1 = Math.min(x1, o.points[i])
        x2 = Math.max(x2, o.points[i])
        y1 = Math.min(y1, o.points[i + 1])
        y2 = Math.max(y2, o.points[i + 1])
      }
      const pad = o.strokeWidth / 2
      return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 }
    }
    case 'shape': {
      const pad = o.strokeWidth / 2
      return { x: o.x - pad, y: o.y - pad, w: o.w + pad * 2, h: o.h + pad * 2 }
    }
    case 'line': {
      const pad = o.strokeWidth / 2 + (o.startCap !== 'none' || o.endCap !== 'none' ? arrowSize(o.strokeWidth) / 2 : 0)
      const r = rectFromPoints({ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 })
      return expandRect(r, pad)
    }
    case 'table': {
      const s = tableSize(o)
      return { x: o.x, y: o.y, w: s.w, h: s.h }
    }
    default:
      return { x: o.x, y: o.y, w: o.w, h: o.h }
  }
}

/** The geometric box used for resizing (no stroke padding). */
export function objectFrame(o: BoardObject): Rect {
  switch (o.type) {
    case 'shape':
      return { x: o.x, y: o.y, w: o.w, h: o.h }
    case 'line':
      return rectFromPoints({ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 })
    case 'stroke': {
      const b = objectBounds(o)
      const pad = o.width / 2
      return { x: b.x + pad, y: b.y + pad, w: b.w - pad * 2, h: b.h - pad * 2 }
    }
    case 'polygon': {
      const b = objectBounds(o)
      const pad = o.strokeWidth / 2
      return { x: b.x + pad, y: b.y + pad, w: b.w - pad * 2, h: b.h - pad * 2 }
    }
    default:
      return objectBounds(o)
  }
}

// ---------------------------------------------------------------------------
// Hit testing

/** True when page point (x, y) touches the object, with `tol` page-units of slack. */
export function hitTest(o: BoardObject, x: number, y: number, tol: number): boolean {
  if (!rectContainsPoint(objectBounds(o), x, y, tol)) return false
  switch (o.type) {
    case 'stroke':
      return distToPolyline(x, y, o.points, 3) <= tol + o.width / 2
    case 'line':
      return distToSegment(x, y, o.x1, o.y1, o.x2, o.y2) <= tol + o.strokeWidth / 2
    case 'polygon': {
      if (o.fill && o.closed && pointInPolygon(x, y, o.points)) return true
      return distToPolyline(x, y, o.points, 2, o.closed) <= tol + o.strokeWidth / 2
    }
    case 'shape': {
      const outline = shapeOutline(o)
      if (o.fill && pointInPolygon(x, y, outline)) return true
      if (distToPolyline(x, y, outline, 2, true) <= tol + o.strokeWidth / 2) return true
      // Small unfilled shapes are hard to hit on the outline alone.
      return o.w * o.h < 900 && pointInPolygon(x, y, outline)
    }
    default:
      return true
  }
}

/** True when the object's geometry intersects a circle (used by the object eraser). */
export function touchesCircle(o: BoardObject, cx: number, cy: number, r: number): boolean {
  if (!rectContainsPoint(objectBounds(o), cx, cy, r)) return false
  switch (o.type) {
    case 'stroke':
      return distToPolyline(cx, cy, o.points, 3) <= r + o.width / 2
    case 'line':
      return distToSegment(cx, cy, o.x1, o.y1, o.x2, o.y2) <= r + o.strokeWidth / 2
    case 'polygon':
      return distToPolyline(cx, cy, o.points, 2, o.closed) <= r + o.strokeWidth / 2 || (!!o.fill && o.closed && pointInPolygon(cx, cy, o.points))
    case 'shape': {
      const outline = shapeOutline(o)
      return distToPolyline(cx, cy, outline, 2, true) <= r + o.strokeWidth / 2 || (!!o.fill && pointInPolygon(cx, cy, outline))
    }
    default:
      return false
  }
}

// ---------------------------------------------------------------------------
// Transforms

function mapX(v: number, from: Rect, to: Rect): number {
  return from.w ? to.x + ((v - from.x) * to.w) / from.w : to.x + (v - from.x)
}
function mapY(v: number, from: Rect, to: Rect): number {
  return from.h ? to.y + ((v - from.y) * to.h) / from.h : to.y + (v - from.y)
}

/**
 * Maps an object from one reference frame to another (used for resizing a
 * selection). Text/math scale their font; strokes keep their width.
 */
export function scaleObject<T extends BoardObject>(o: T, from: Rect, to: Rect): T {
  const sx = from.w ? to.w / from.w : 1
  const sy = from.h ? to.h / from.h : 1
  switch (o.type) {
    case 'stroke': {
      const pts = o.points.slice()
      for (let i = 0; i < pts.length; i += 3) {
        pts[i] = mapX(pts[i], from, to)
        pts[i + 1] = mapY(pts[i + 1], from, to)
      }
      return { ...o, points: pts }
    }
    case 'polygon': {
      const pts = o.points.slice()
      for (let i = 0; i < pts.length; i += 2) {
        pts[i] = mapX(pts[i], from, to)
        pts[i + 1] = mapY(pts[i + 1], from, to)
      }
      return { ...o, points: pts }
    }
    case 'line':
      return { ...o, x1: mapX(o.x1, from, to), y1: mapY(o.y1, from, to), x2: mapX(o.x2, from, to), y2: mapY(o.y2, from, to) }
    case 'shape': {
      const x1 = mapX(o.x, from, to)
      const y1 = mapY(o.y, from, to)
      const x2 = mapX(o.x + o.w, from, to)
      const y2 = mapY(o.y + o.h, from, to)
      return { ...o, x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.max(1, Math.abs(x2 - x1)), h: Math.max(1, Math.abs(y2 - y1)) }
    }
    case 'text': {
      const fontScale = Math.abs(sy - 1) < 1e-6 ? 1 : Math.abs(sy)
      return {
        ...o,
        x: mapX(o.x, from, to),
        y: mapY(o.y, from, to),
        w: Math.max(20, o.w * Math.abs(sx)),
        h: o.h * Math.abs(sy),
        fontSize: Math.max(6, Math.min(400, o.fontSize * fontScale))
      }
    }
    case 'math': {
      const s = Math.abs(sy)
      return { ...o, x: mapX(o.x, from, to), y: mapY(o.y, from, to), w: o.w * s, h: o.h * s, fontSize: Math.max(6, Math.min(600, o.fontSize * s)) }
    }
    case 'table':
      return {
        ...o,
        x: mapX(o.x, from, to),
        y: mapY(o.y, from, to),
        colWidths: o.colWidths.map((c) => Math.max(16, c * Math.abs(sx))),
        rowHeights: o.rowHeights.map((r) => Math.max(12, r * Math.abs(sy)))
      }
    default: {
      const b = o as unknown as Rect
      const x1 = mapX(b.x, from, to)
      const y1 = mapY(b.y, from, to)
      const x2 = mapX(b.x + b.w, from, to)
      const y2 = mapY(b.y + b.h, from, to)
      return { ...o, x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.max(1, Math.abs(x2 - x1)), h: Math.max(1, Math.abs(y2 - y1)) }
    }
  }
}

/** Whether resizing should keep the aspect ratio by default for these objects. */
export function prefersUniformScale(objects: BoardObject[]): boolean {
  return objects.some((o) => o.type === 'math' || o.type === 'image' || (o.type === 'text' && objects.length > 1))
}
