import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import {
  addSection,
  allPages,
  clonePage,
  createDocument,
  createPage,
  deletePage,
  locatePage,
  movePage,
  pageCount,
  referencedAssetIds,
  removeSection
} from '../../src/renderer/src/core/document'
import type { LessonDocument } from '../../src/renderer/src/core/model'

function docWithPages(n: number): LessonDocument {
  const d = createDocument()
  return produce(d, (draft) => {
    for (let i = 1; i < n; i++) draft.sections[0].pages.push(createPage(d.pageDefaults))
  })
}

describe('document model', () => {
  it('starts with one section and one 16:9 page', () => {
    const d = createDocument()
    expect(d.sections).toHaveLength(1)
    expect(pageCount(d)).toBe(1)
    expect(allPages(d)[0]).toMatchObject({ width: 1920, height: 1080 })
  })

  it('never deletes the last page', () => {
    const d = createDocument()
    const id = allPages(d)[0].id
    let ok = true
    const next = produce(d, (draft) => {
      ok = deletePage(draft as LessonDocument, id)
    })
    expect(ok).toBe(false)
    expect(pageCount(next)).toBe(1)
  })

  it('deletes and reorders pages', () => {
    const d = docWithPages(4)
    const ids = allPages(d).map((p) => p.id)
    const afterDelete = produce(d, (draft) => void deletePage(draft as LessonDocument, ids[1]))
    expect(allPages(afterDelete).map((p) => p.id)).toEqual([ids[0], ids[2], ids[3]])
    const moved = produce(d, (draft) => void movePage(draft as LessonDocument, ids[0], d.sections[0].id, 3))
    expect(allPages(moved).map((p) => p.id)).toEqual([ids[1], ids[2], ids[0], ids[3]])
  })

  it('duplicates pages with fresh ids and independent content', () => {
    const page = { ...createPage(createDocument().pageDefaults), objects: [{ id: 'o1', type: 'line' as const, x1: 0, y1: 0, x2: 1, y2: 1, stroke: '#000', strokeWidth: 1, dash: 'solid' as const, startCap: 'none' as const, endCap: 'none' as const }] }
    const copy = clonePage(page)
    expect(copy.id).not.toBe(page.id)
    expect(copy.objects[0].id).not.toBe('o1')
    expect(copy.background).not.toBe(page.background)
    expect(copy.background).toEqual(page.background)
  })

  it('manages sections and keeps pages when a section is removed', () => {
    const d = docWithPages(2)
    const withSection = produce(d, (draft) => void addSection(draft as LessonDocument, 'Part 2', draft.sections[0].id, createPage(d.pageDefaults)))
    expect(withSection.sections.map((s) => s.name)).toEqual(['Section 1', 'Part 2'])
    expect(pageCount(withSection)).toBe(3)
    const removed = produce(withSection, (draft) => void removeSection(draft as LessonDocument, withSection.sections[1].id, true))
    expect(removed.sections).toHaveLength(1)
    expect(pageCount(removed)).toBe(3)
    const deleted = produce(withSection, (draft) => void removeSection(draft as LessonDocument, withSection.sections[1].id, false))
    expect(pageCount(deleted)).toBe(2)
    // The only section can never be removed.
    const blocked = produce(d, (draft) => void removeSection(draft as LessonDocument, d.sections[0].id, true))
    expect(blocked).toBe(d)
  })

  it('locates pages across sections', () => {
    const d = produce(docWithPages(2), (draft) => void addSection(draft as LessonDocument, 'B', null, createPage(draft.pageDefaults)))
    const last = allPages(d)[2]
    expect(locatePage(d, last.id)).toEqual({ sectionIndex: 1, pageIndex: 0, globalIndex: 2 })
  })

  it('collects referenced assets from images and backgrounds', () => {
    const d = produce(createDocument(), (draft) => {
      draft.sections[0].pages[0].background.imageAssetId = 'bg'
      draft.sections[0].pages[0].objects.push({ id: 'i', type: 'image', x: 0, y: 0, w: 1, h: 1, assetId: 'img', opacity: 1, name: '' })
    })
    expect([...referencedAssetIds(d)].sort()).toEqual(['bg', 'img'])
  })
})
