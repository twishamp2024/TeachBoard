import { beforeEach, describe, expect, it } from 'vitest'
import { allPages, createDocument, createPage } from '../../src/renderer/src/core/document'
import type { StrokeObject } from '../../src/renderer/src/core/model'
import { currentPage, isDirty, onPage, useDoc } from '../../src/renderer/src/state/doc'

function stroke(id: string): StrokeObject {
  return { id, type: 'stroke', tool: 'pen', style: 'pen', color: '#000', width: 3, opacity: 1, points: [0, 0, 0.5, 10, 10, 0.5], pressure: false }
}

const objectsOn = (pageIndex: number) => allPages(useDoc.getState().doc)[pageIndex].objects.map((o) => o.id)

beforeEach(() => {
  useDoc.getState().reset(createDocument(), null, true)
})

describe('undo / redo', () => {
  it('undoes and redoes drawing in order', () => {
    const s = useDoc.getState()
    s.commit('Draw', onPage(s.pageId, (p) => void p.objects.push(stroke('a'))))
    s.commit('Draw', onPage(s.pageId, (p) => void p.objects.push(stroke('b'))))
    expect(objectsOn(0)).toEqual(['a', 'b'])
    useDoc.getState().undo()
    expect(objectsOn(0)).toEqual(['a'])
    useDoc.getState().undo()
    expect(objectsOn(0)).toEqual([])
    expect(useDoc.getState().undo()).toBe(false)
    useDoc.getState().redo()
    useDoc.getState().redo()
    expect(objectsOn(0)).toEqual(['a', 'b'])
    expect(useDoc.getState().redo()).toBe(false)
  })

  it('stays consistent after many repeated undo/redo cycles', () => {
    const s = useDoc.getState()
    for (let i = 0; i < 20; i++) useDoc.getState().commit('Draw', onPage(s.pageId, (p) => void p.objects.push(stroke(`s${i}`))))
    for (let cycle = 0; cycle < 5; cycle++) {
      for (let i = 0; i < 20; i++) useDoc.getState().undo()
      expect(objectsOn(0)).toEqual([])
      for (let i = 0; i < 20; i++) useDoc.getState().redo()
      expect(objectsOn(0)).toHaveLength(20)
    }
    expect(new Set(objectsOn(0)).size).toBe(20)
  })

  it('discards the redo branch after a new change', () => {
    const s = useDoc.getState()
    s.commit('Draw', onPage(s.pageId, (p) => void p.objects.push(stroke('a'))))
    useDoc.getState().undo()
    useDoc.getState().commit('Draw', onPage(s.pageId, (p) => void p.objects.push(stroke('b'))))
    expect(useDoc.getState().redo()).toBe(false)
    expect(objectsOn(0)).toEqual(['b'])
  })

  it('records a transaction (drag/erase) as a single step', () => {
    const s = useDoc.getState()
    s.commit('Draw', onPage(s.pageId, (p) => void p.objects.push(stroke('a'))))
    useDoc.getState().begin()
    for (let i = 1; i <= 10; i++) {
      useDoc.getState().transient(
        onPage(s.pageId, (p) => {
          const o = p.objects[0] as StrokeObject
          o.points = [i, i, 0.5, 10 + i, 10 + i, 0.5]
        })
      )
    }
    useDoc.getState().end('Move')
    expect((currentPage(useDoc.getState()).objects[0] as StrokeObject).points[0]).toBe(10)
    useDoc.getState().undo()
    expect((currentPage(useDoc.getState()).objects[0] as StrokeObject).points[0]).toBe(0)
  })

  it('navigates to the page where an undone change happened', () => {
    const s = useDoc.getState()
    const second = createPage(s.doc.pageDefaults)
    s.commit('Add page', (d) => void d.sections[0].pages.push(second), { pageId: second.id })
    const firstId = allPages(useDoc.getState().doc)[0].id
    useDoc.getState().goToPage(firstId)
    useDoc.getState().commit('Draw', onPage(firstId, (p) => void p.objects.push(stroke('on-first'))))
    useDoc.getState().goToPage(second.id)
    useDoc.getState().commit('Draw', onPage(second.id, (p) => void p.objects.push(stroke('on-second'))))
    useDoc.getState().goToPage(firstId)
    // Undo the change made on page 2 while viewing page 1: the view follows the change.
    useDoc.getState().undo()
    expect(useDoc.getState().pageId).toBe(second.id)
    expect(objectsOn(1)).toEqual([])
    expect(objectsOn(0)).toEqual(['on-first'])
    useDoc.getState().redo()
    expect(useDoc.getState().pageId).toBe(second.id)
    expect(objectsOn(1)).toEqual(['on-second'])
  })

  it('handles undoing page creation and deletion safely', () => {
    const s = useDoc.getState()
    const page = createPage(s.doc.pageDefaults)
    s.commit('Add page', (d) => void d.sections[0].pages.push(page), { pageId: page.id })
    expect(useDoc.getState().pageId).toBe(page.id)
    useDoc.getState().undo()
    // The current page no longer exists; the store falls back to a valid page.
    expect(allPages(useDoc.getState().doc)).toHaveLength(1)
    expect(allPages(useDoc.getState().doc)[0].id).toBe(useDoc.getState().pageId)
  })

  it('tracks unsaved changes against the saved document', () => {
    expect(isDirty(useDoc.getState())).toBe(false)
    const s = useDoc.getState()
    s.commit('Draw', onPage(s.pageId, (p) => void p.objects.push(stroke('a'))))
    expect(isDirty(useDoc.getState())).toBe(true)
    useDoc.getState().undo()
    expect(isDirty(useDoc.getState())).toBe(false)
  })

  it('removes deleted objects from the selection', () => {
    const s = useDoc.getState()
    s.commit('Draw', onPage(s.pageId, (p) => void p.objects.push(stroke('a'))), { select: ['a'] })
    expect(useDoc.getState().selection).toEqual(['a'])
    useDoc.getState().undo()
    expect(useDoc.getState().selection).toEqual([])
  })
})
