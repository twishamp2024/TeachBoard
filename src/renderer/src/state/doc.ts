import { create } from 'zustand'
import { produce, type Draft } from 'immer'
import { allPages, createDocument, findPage, locatePage, pageAt, pageCount } from '../core/document'
import { emptyHistory, record, redo as redoStep, undo as undoStep, type HistoryState } from '../core/history'
import type { Id, LessonDocument, Page } from '../core/model'

export type Recipe = (draft: Draft<LessonDocument>) => void

export interface DocStore {
  doc: LessonDocument
  /** The document as last saved or opened; dirty when `doc !== savedDoc`. */
  savedDoc: LessonDocument | null
  filePath: string | null
  history: HistoryState
  pageId: Id
  selection: Id[]
  /** Base document of an open transaction (drag, erase, …). */
  txBase: LessonDocument | null
  /** Bumped on every document change; used by autosave/recovery. */
  revision: number
  /** Label of the last undo/redo, for status feedback. */
  lastAction: string | null

  reset(doc: LessonDocument, filePath: string | null, saved: boolean): void
  commit(label: string, recipe: Recipe, opts?: { select?: Id[]; pageId?: Id }): boolean
  begin(): void
  transient(recipe: Recipe): void
  end(label: string, opts?: { select?: Id[] }): boolean
  cancel(): void
  undo(): boolean
  redo(): boolean
  goToPage(id: Id): void
  goToIndex(index: number): void
  setSelection(ids: Id[]): void
  markSaved(path: string, savedDoc: LessonDocument): void
}

function firstPageId(doc: LessonDocument): Id {
  return allPages(doc)[0].id
}

/** Picks a valid page after the document changed underneath the current page. */
function resolvePage(doc: LessonDocument, preferred: Id | null, fallbackIndex: number): Id {
  if (preferred && findPage(doc, preferred)) return preferred
  const n = pageCount(doc)
  return pageAt(doc, Math.max(0, Math.min(fallbackIndex, n - 1)))?.id ?? firstPageId(doc)
}

function filterSelection(doc: LessonDocument, pageId: Id, ids: Id[]): Id[] {
  const page = findPage(doc, pageId)
  if (!ids.length) return ids
  if (!page) return []
  const present = new Set(page.objects.map((o) => o.id))
  const kept = ids.filter((id) => present.has(id))
  return kept.length === ids.length ? ids : kept
}

const initialDoc = createDocument()

export const useDoc = create<DocStore>((set, get) => ({
  doc: initialDoc,
  savedDoc: initialDoc,
  filePath: null,
  history: emptyHistory(),
  pageId: firstPageId(initialDoc),
  selection: [],
  txBase: null,
  revision: 0,
  lastAction: null,

  reset(doc, filePath, saved) {
    set({
      doc,
      savedDoc: saved ? doc : null,
      filePath,
      history: emptyHistory(),
      pageId: firstPageId(doc),
      selection: [],
      txBase: null,
      revision: get().revision + 1,
      lastAction: null
    })
  },

  commit(label, recipe, opts) {
    const s = get()
    if (s.txBase) s.end('Edit')
    const before = get().doc
    const next = produce(before, recipe)
    if (next === before) return false
    const loc = locatePage(before, s.pageId)
    const pageId = opts?.pageId ?? resolvePage(next, s.pageId, loc?.globalIndex ?? 0)
    set({
      doc: next,
      history: record(get().history, before, label, s.pageId),
      pageId,
      selection: filterSelection(next, pageId, opts?.select ?? get().selection),
      revision: s.revision + 1
    })
    return true
  },

  begin() {
    if (!get().txBase) set({ txBase: get().doc })
  },

  transient(recipe) {
    const s = get()
    if (!s.txBase) set({ txBase: s.doc })
    const next = produce(get().doc, recipe)
    if (next !== get().doc) set({ doc: next })
  },

  end(label, opts) {
    const s = get()
    const base = s.txBase
    if (!base) return false
    if (s.doc === base) {
      set({ txBase: null })
      return false
    }
    set({
      txBase: null,
      history: record(s.history, base, label, s.pageId),
      selection: filterSelection(s.doc, s.pageId, opts?.select ?? s.selection),
      revision: s.revision + 1
    })
    return true
  },

  cancel() {
    const base = get().txBase
    if (base) set({ doc: base, txBase: null })
  },

  undo() {
    const s = get()
    if (s.txBase) s.cancel()
    const cur = get()
    const step = undoStep(cur.history, cur.doc)
    if (!step) return false
    const idx = locatePage(cur.doc, cur.pageId)?.globalIndex ?? 0
    const pageId = resolvePage(step.doc, step.pageId ?? cur.pageId, idx)
    set({
      doc: step.doc,
      history: step.history,
      pageId,
      selection: filterSelection(step.doc, pageId, cur.selection),
      revision: cur.revision + 1,
      lastAction: `Undo ${step.label}`
    })
    return true
  },

  redo() {
    const s = get()
    if (s.txBase) s.cancel()
    const cur = get()
    const step = redoStep(cur.history, cur.doc)
    if (!step) return false
    const idx = locatePage(cur.doc, cur.pageId)?.globalIndex ?? 0
    const pageId = resolvePage(step.doc, step.pageId ?? cur.pageId, idx)
    set({
      doc: step.doc,
      history: step.history,
      pageId,
      selection: filterSelection(step.doc, pageId, cur.selection),
      revision: cur.revision + 1,
      lastAction: `Redo ${step.label}`
    })
    return true
  },

  goToPage(id) {
    const s = get()
    if (id === s.pageId || !findPage(s.doc, id)) return
    if (s.txBase) s.end('Edit')
    set({ pageId: id, selection: [] })
  },

  goToIndex(index) {
    const page = pageAt(get().doc, Math.max(0, Math.min(index, pageCount(get().doc) - 1)))
    if (page) get().goToPage(page.id)
  },

  setSelection(ids) {
    const cur = get().selection
    if (cur.length === ids.length && cur.every((id, i) => id === ids[i])) return
    set({ selection: ids })
  },

  markSaved(path, savedDoc) {
    set({ filePath: path, savedDoc })
  }
}))

// ---------------------------------------------------------------------------
// Selectors

export function currentPage(s: Pick<DocStore, 'doc' | 'pageId'>): Page {
  return findPage(s.doc, s.pageId) ?? allPages(s.doc)[0]
}

export function isDirty(s: Pick<DocStore, 'doc' | 'savedDoc'>): boolean {
  return s.doc !== s.savedDoc
}

export function currentPageIndex(s: Pick<DocStore, 'doc' | 'pageId'>): number {
  return locatePage(s.doc, s.pageId)?.globalIndex ?? 0
}

/** Recipe helper: mutate the objects of one page. */
export function onPage(pageId: Id, fn: (page: Draft<Page>) => void): Recipe {
  return (d) => {
    const loc = locatePage(d as LessonDocument, pageId)
    if (loc) fn(d.sections[loc.sectionIndex].pages[loc.pageIndex])
  }
}
