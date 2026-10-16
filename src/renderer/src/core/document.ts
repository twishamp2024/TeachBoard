import {
  DEFAULT_BACKGROUND,
  type Background,
  type BoardObject,
  type Id,
  type LessonDocument,
  type Page,
  type PageDefaults,
  type Section
} from './model'

let counter = 0

/** Short, collision-resistant ids that are safe in file names. */
export function newId(prefix = ''): Id {
  counter = (counter + 1) % 0x10000
  const rand = Math.floor(Math.random() * 0x100000000).toString(36)
  return `${prefix}${Date.now().toString(36)}${counter.toString(36).padStart(3, '0')}${rand}`
}

export function cloneBackground(bg: Background): Background {
  return { ...bg }
}

export function createPage(defaults: PageDefaults): Page {
  return {
    id: newId('p'),
    width: defaults.width,
    height: defaults.height,
    background: cloneBackground(defaults.background),
    objects: []
  }
}

export function createSection(name: string, pages: Page[] = []): Section {
  return { id: newId('s'), name, collapsed: false, pages }
}

export function createDocument(defaults?: Partial<PageDefaults>, title = 'Untitled Lesson'): LessonDocument {
  const pageDefaults: PageDefaults = {
    width: defaults?.width ?? 1920,
    height: defaults?.height ?? 1080,
    background: cloneBackground(defaults?.background ?? DEFAULT_BACKGROUND)
  }
  const now = new Date().toISOString()
  return {
    id: newId('d'),
    title,
    createdAt: now,
    modifiedAt: now,
    pageDefaults,
    sections: [createSection('Section 1', [createPage(pageDefaults)])],
    assets: {}
  }
}

// ---------------------------------------------------------------------------
// Queries

export function allPages(doc: LessonDocument): Page[] {
  const out: Page[] = []
  for (const s of doc.sections) out.push(...s.pages)
  return out
}

export function pageCount(doc: LessonDocument): number {
  let n = 0
  for (const s of doc.sections) n += s.pages.length
  return n
}

export interface PageLocation {
  sectionIndex: number
  pageIndex: number
  /** Index across the whole document, 0-based. */
  globalIndex: number
}

export function locatePage(doc: LessonDocument, pageId: Id): PageLocation | null {
  let g = 0
  for (let s = 0; s < doc.sections.length; s++) {
    const pages = doc.sections[s].pages
    for (let p = 0; p < pages.length; p++) {
      if (pages[p].id === pageId) return { sectionIndex: s, pageIndex: p, globalIndex: g }
      g++
    }
  }
  return null
}

export function findPage(doc: LessonDocument, pageId: Id): Page | null {
  const loc = locatePage(doc, pageId)
  return loc ? doc.sections[loc.sectionIndex].pages[loc.pageIndex] : null
}

export function pageAt(doc: LessonDocument, globalIndex: number): Page | null {
  return allPages(doc)[globalIndex] ?? null
}

export function sectionOfPage(doc: LessonDocument, pageId: Id): Section | null {
  const loc = locatePage(doc, pageId)
  return loc ? doc.sections[loc.sectionIndex] : null
}

/** Collects every asset id referenced by pages (objects and backgrounds). */
export function referencedAssetIds(doc: LessonDocument): Set<Id> {
  const ids = new Set<Id>()
  for (const page of allPages(doc)) {
    if (page.background.imageAssetId) ids.add(page.background.imageAssetId)
    for (const o of page.objects) if (o.type === 'image') ids.add(o.assetId)
  }
  if (doc.pageDefaults.background.imageAssetId) ids.add(doc.pageDefaults.background.imageAssetId)
  return ids
}

// ---------------------------------------------------------------------------
// Mutations. These operate on (immer) drafts and keep the document valid:
// a document always has at least one section and at least one page.

export function insertPageAfter(doc: LessonDocument, afterPageId: Id | null, page: Page): void {
  if (afterPageId) {
    const loc = locatePage(doc, afterPageId)
    if (loc) {
      doc.sections[loc.sectionIndex].pages.splice(loc.pageIndex + 1, 0, page)
      return
    }
  }
  const last = doc.sections[doc.sections.length - 1]
  last.pages.push(page)
}

export function clonePage(page: Page): Page {
  return {
    id: newId('p'),
    width: page.width,
    height: page.height,
    background: cloneBackground(page.background),
    objects: page.objects.map((o) => cloneObject(o))
  }
}

export function cloneObject<T extends BoardObject>(obj: T, dx = 0, dy = 0): T {
  const copy = structuredClone(obj) as T
  copy.id = newId('o')
  return dx || dy ? translateObjectData(copy, dx, dy) : copy
}

/** Returns false (and leaves the document untouched) when deleting the last page. */
export function deletePage(doc: LessonDocument, pageId: Id): boolean {
  if (pageCount(doc) <= 1) return false
  const loc = locatePage(doc, pageId)
  if (!loc) return false
  doc.sections[loc.sectionIndex].pages.splice(loc.pageIndex, 1)
  // Empty sections are kept (they are visible groups); but never zero sections.
  return true
}

/** Moves a page to `targetSection` at `targetIndex` (index within that section, before removal adjustments). */
export function movePage(doc: LessonDocument, pageId: Id, targetSectionId: Id, targetIndex: number): boolean {
  const loc = locatePage(doc, pageId)
  const targetSi = doc.sections.findIndex((s) => s.id === targetSectionId)
  if (!loc || targetSi < 0) return false
  const [page] = doc.sections[loc.sectionIndex].pages.splice(loc.pageIndex, 1)
  let idx = targetIndex
  if (targetSi === loc.sectionIndex && loc.pageIndex < targetIndex) idx -= 1
  const pages = doc.sections[targetSi].pages
  idx = Math.max(0, Math.min(idx, pages.length))
  pages.splice(idx, 0, page)
  return true
}

export function addSection(doc: LessonDocument, name: string, afterSectionId: Id | null, firstPage: Page | null): Section {
  const section = createSection(name, firstPage ? [firstPage] : [])
  const idx = afterSectionId ? doc.sections.findIndex((s) => s.id === afterSectionId) : -1
  if (idx >= 0) doc.sections.splice(idx + 1, 0, section)
  else doc.sections.push(section)
  return section
}

/**
 * Removes a section. With `keepPages` its pages move to the neighbouring
 * section; otherwise they are deleted. Refuses to leave the document without
 * pages or sections.
 */
export function removeSection(doc: LessonDocument, sectionId: Id, keepPages: boolean): boolean {
  const idx = doc.sections.findIndex((s) => s.id === sectionId)
  if (idx < 0 || doc.sections.length <= 1) return false
  const section = doc.sections[idx]
  if (!keepPages && pageCount(doc) - section.pages.length < 1) return false
  doc.sections.splice(idx, 1)
  if (keepPages && section.pages.length) {
    const target = doc.sections[Math.max(0, idx - 1)]
    if (idx - 1 >= 0) target.pages.push(...section.pages)
    else target.pages.unshift(...section.pages)
  }
  return true
}

export function moveSection(doc: LessonDocument, sectionId: Id, delta: -1 | 1): boolean {
  const idx = doc.sections.findIndex((s) => s.id === sectionId)
  const to = idx + delta
  if (idx < 0 || to < 0 || to >= doc.sections.length) return false
  const [s] = doc.sections.splice(idx, 1)
  doc.sections.splice(to, 0, s)
  return true
}

// ---------------------------------------------------------------------------
// Object helpers

export function translateObjectData<T extends BoardObject>(obj: T, dx: number, dy: number): T {
  switch (obj.type) {
    case 'stroke': {
      const pts = obj.points.slice()
      for (let i = 0; i < pts.length; i += 3) {
        pts[i] += dx
        pts[i + 1] += dy
      }
      return { ...obj, points: pts }
    }
    case 'polygon': {
      const pts = obj.points.slice()
      for (let i = 0; i < pts.length; i += 2) {
        pts[i] += dx
        pts[i + 1] += dy
      }
      return { ...obj, points: pts }
    }
    case 'line':
      return { ...obj, x1: obj.x1 + dx, y1: obj.y1 + dy, x2: obj.x2 + dx, y2: obj.y2 + dy }
    default:
      return { ...obj, x: (obj as { x: number }).x + dx, y: (obj as { y: number }).y + dy }
  }
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}
