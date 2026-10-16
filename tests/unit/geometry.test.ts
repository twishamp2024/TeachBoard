import { describe, expect, it } from 'vitest'
import {
  distToSegment,
  hitTest,
  objectBounds,
  pointInPolygon,
  scaleObject,
  shapeOutline,
  touchesCircle,
  unionRects
} from '../../src/renderer/src/core/geometry'
import { SHAPE_KINDS, type LineObject, type ShapeObject, type StrokeObject, type TextObject } from '../../src/renderer/src/core/model'
import { dragBox } from '../../src/renderer/src/tools/shapeTools'

const shape = (over: Partial<ShapeObject> = {}): ShapeObject => ({
  id: 's',
  type: 'shape',
  kind: 'rect',
  x: 100,
  y: 100,
  w: 200,
  h: 100,
  stroke: '#000',
  fill: null,
  strokeWidth: 4,
  dash: 'solid',
  flipX: false,
  flipY: false,
  ...over
})

const stroke = (points: number[], width = 4): StrokeObject => ({
  id: 'k',
  type: 'stroke',
  tool: 'pen',
  style: 'pen',
  color: '#000',
  width,
  opacity: 1,
  points,
  pressure: false
})

describe('shape geometry', () => {
  it('produces an outline inside the box for every shape kind', () => {
    for (const kind of SHAPE_KINDS) {
      const pts = shapeOutline(shape({ kind }))
      expect(pts.length).toBeGreaterThanOrEqual(6)
      for (let i = 0; i < pts.length; i += 2) {
        expect(pts[i]).toBeGreaterThanOrEqual(100 - 1e-6)
        expect(pts[i]).toBeLessThanOrEqual(300 + 1e-6)
        expect(pts[i + 1]).toBeGreaterThanOrEqual(100 - 1e-6)
        expect(pts[i + 1]).toBeLessThanOrEqual(200 + 1e-6)
      }
    }
  })

  it('fills the full box for regular polygons (normalised)', () => {
    for (const kind of ['pentagon', 'hexagon', 'star'] as const) {
      const pts = shapeOutline(shape({ kind }))
      const xs = pts.filter((_, i) => i % 2 === 0)
      const ys = pts.filter((_, i) => i % 2 === 1)
      expect(Math.min(...xs)).toBeCloseTo(100)
      expect(Math.max(...xs)).toBeCloseTo(300)
      expect(Math.min(...ys)).toBeCloseTo(100)
      expect(Math.max(...ys)).toBeCloseTo(200)
    }
  })

  it('mirrors asymmetric shapes with flipX', () => {
    const a = shapeOutline(shape({ kind: 'rightTriangle' }))
    const b = shapeOutline(shape({ kind: 'rightTriangle', flipX: true }))
    expect(a[0]).toBeCloseTo(100)
    expect(b[0]).toBeCloseTo(300)
  })

  it('normalises drag boxes in every direction', () => {
    expect(dragBox(300, 200, 100, 100, false, false)).toEqual({ x: 100, y: 100, w: 200, h: 100 })
    expect(dragBox(100, 200, 300, 100, false, false)).toEqual({ x: 100, y: 100, w: 200, h: 100 })
    expect(dragBox(300, 100, 100, 200, false, false)).toEqual({ x: 100, y: 100, w: 200, h: 100 })
    // Shift: square, keeping the drag direction
    expect(dragBox(300, 300, 100, 250, true, false)).toEqual({ x: 100, y: 100, w: 200, h: 200 })
    // Alt: from centre
    expect(dragBox(200, 200, 250, 230, false, true)).toEqual({ x: 150, y: 170, w: 100, h: 60 })
  })
})

describe('hit testing', () => {
  it('hits unfilled shapes on the outline only', () => {
    const s = shape()
    expect(hitTest(s, 100, 150, 2)).toBe(true)
    expect(hitTest(s, 200, 150, 2)).toBe(false)
    expect(hitTest({ ...s, fill: '#f00' }, 200, 150, 2)).toBe(true)
  })

  it('hits strokes within half their width plus tolerance', () => {
    const k = stroke([0, 0, 0.5, 100, 0, 0.5], 10)
    expect(hitTest(k, 50, 6, 2)).toBe(true)
    expect(hitTest(k, 50, 9, 2)).toBe(false)
  })

  it('detects circle contact for the object eraser', () => {
    const l: LineObject = { id: 'l', type: 'line', x1: 0, y1: 0, x2: 100, y2: 100, stroke: '#000', strokeWidth: 2, dash: 'solid', startCap: 'none', endCap: 'arrow' }
    expect(touchesCircle(l, 50, 60, 10)).toBe(true)
    expect(touchesCircle(l, 50, 90, 10)).toBe(false)
  })

  it('computes point/segment and polygon tests', () => {
    expect(distToSegment(5, 5, 0, 0, 10, 0)).toBe(5)
    expect(pointInPolygon(5, 5, [0, 0, 10, 0, 10, 10, 0, 10])).toBe(true)
    expect(pointInPolygon(15, 5, [0, 0, 10, 0, 10, 10, 0, 10])).toBe(false)
  })
})

describe('bounds and scaling', () => {
  it('pads stroke bounds by half the width', () => {
    expect(objectBounds(stroke([10, 10, 0.5, 30, 50, 0.5], 4))).toEqual({ x: 8, y: 8, w: 24, h: 44 })
  })

  it('unions rectangles', () => {
    expect(unionRects([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 5, w: 5, h: 20 }])).toEqual({ x: 0, y: 0, w: 25, h: 25 })
    expect(unionRects([])).toBeNull()
  })

  it('scales shapes, strokes and text between frames', () => {
    const from = { x: 100, y: 100, w: 200, h: 100 }
    const to = { x: 100, y: 100, w: 400, h: 200 }
    expect(scaleObject(shape(), from, to)).toMatchObject({ x: 100, y: 100, w: 400, h: 200 })
    const k = scaleObject(stroke([100, 100, 0.5, 300, 200, 0.5]), from, to)
    expect(k.points).toEqual([100, 100, 0.5, 500, 300, 0.5])
    const t: TextObject = { id: 't', type: 'text', x: 100, y: 100, w: 200, h: 50, text: 'x', fontFamily: 'Inter', fontSize: 20, color: '#000', bold: false, italic: false, underline: false, align: 'left', background: null }
    expect(scaleObject(t, from, to)).toMatchObject({ w: 400, fontSize: 40 })
    // Width-only resize rewraps text without changing font size.
    expect(scaleObject(t, from, { ...from, w: 300 })).toMatchObject({ w: 300, fontSize: 20 })
  })
})
