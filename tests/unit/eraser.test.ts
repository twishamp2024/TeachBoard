import { describe, expect, it } from 'vitest'
import { applyEraser, densify, eraseStrokeSegment, isErasable } from '../../src/renderer/src/core/eraser'
import type { BoardObject, ShapeObject, StrokeObject, TextObject } from '../../src/renderer/src/core/model'

function line(id: string, x1: number, x2: number, y = 100): StrokeObject {
  const pts: number[] = []
  for (let x = x1; x <= x2; x += 5) pts.push(x, y, 0.5)
  return { id, type: 'stroke', tool: 'pen', style: 'pen', color: '#000', width: 4, opacity: 1, points: pts, pressure: false }
}

const rect: ShapeObject = { id: 'r', type: 'shape', kind: 'rect', x: 0, y: 0, w: 50, h: 50, stroke: '#000', fill: null, strokeWidth: 2, dash: 'solid', flipX: false, flipY: false }
const text: TextObject = { id: 't', type: 'text', x: 0, y: 0, w: 100, h: 40, text: 'hello', fontFamily: 'Inter', fontSize: 20, color: '#000', bold: false, italic: false, underline: false, align: 'left', background: null }

describe('partial eraser', () => {
  it('splits a stroke where the eraser crosses it and keeps the id on the first part', () => {
    const s = line('a', 0, 200)
    const out = eraseStrokeSegment(s, 100, 80, 100, 120, 10)!
    expect(out).toHaveLength(2)
    expect(out[0].id).toBe('a')
    expect(out[1].id).not.toBe('a')
    const maxLeft = Math.max(...out[0].points.filter((_, i) => i % 3 === 0))
    const minRight = Math.min(...out[1].points.filter((_, i) => i % 3 === 0))
    expect(maxLeft).toBeLessThan(100 - 10)
    expect(minRight).toBeGreaterThan(100 + 10)
  })

  it('returns null when the stroke is untouched', () => {
    expect(eraseStrokeSegment(line('a', 0, 200), 100, 300, 120, 300, 10)).toBeNull()
  })

  it('removes the whole stroke when fully covered', () => {
    expect(eraseStrokeSegment(line('a', 0, 20), -10, 100, 40, 100, 30)).toEqual([])
  })

  it('densifies sparse strokes so erasing is precise', () => {
    const pts = densify([0, 0, 0.5, 100, 0, 0.5], 10)
    expect(pts.length / 3).toBeGreaterThanOrEqual(11)
    expect(pts.slice(-3)).toEqual([100, 0, 0.5])
  })

  it('leaves shapes and text alone in partial mode', () => {
    const objs: BoardObject[] = [rect, text, line('a', 0, 50, 25)]
    const out = applyEraser(objs, 'partial', 0, 25, 50, 25, 20)
    expect(out).toContain(rect)
    expect(out).toContain(text)
    expect(out.find((o) => o.id === 'a')).toBeUndefined()
  })
})

describe('object eraser', () => {
  it('removes whole strokes and shapes it touches, never text', () => {
    const objs: BoardObject[] = [rect, text, line('a', 0, 200)]
    const out = applyEraser(objs, 'object', 0, 25, 1, 25, 5)
    expect(out.map((o) => o.id)).toEqual(['t', 'a'])
    expect(isErasable(text, 'object')).toBe(false)
  })

  it('returns the same array instance when nothing changes', () => {
    const objs: BoardObject[] = [line('a', 0, 50)]
    expect(applyEraser(objs, 'object', 500, 500, 510, 510, 5)).toBe(objs)
  })

  it('does not skip objects on a fast swipe', () => {
    const objs: BoardObject[] = [line('a', 0, 10, 100), line('b', 400, 410, 100)]
    const out = applyEraser(objs, 'object', -50, 100, 600, 100, 4)
    expect(out).toHaveLength(0)
  })
})
