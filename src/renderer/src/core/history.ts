import type { Id, LessonDocument } from './model'

/**
 * Snapshot history over immutable documents. Because documents are updated
 * with structural sharing, each snapshot only costs the changed path.
 */
export interface HistoryEntry {
  doc: LessonDocument
  label: string
  /** The page that was current when the change was made, for navigation on undo/redo. */
  pageId: Id | null
}

export interface HistoryState {
  past: HistoryEntry[]
  future: HistoryEntry[]
}

export const HISTORY_LIMIT = 300

export function emptyHistory(): HistoryState {
  return { past: [], future: [] }
}

/** Records `before` as the state to return to, discarding any redo branch. */
export function record(h: HistoryState, before: LessonDocument, label: string, pageId: Id | null): HistoryState {
  const past = h.past.length >= HISTORY_LIMIT ? h.past.slice(h.past.length - HISTORY_LIMIT + 1) : h.past.slice()
  past.push({ doc: before, label, pageId })
  return { past, future: [] }
}

/** The change's page is kept on both stacks so undo and redo both navigate to where the change happened. */
export interface Step {
  history: HistoryState
  doc: LessonDocument
  pageId: Id | null
  label: string
}

export function undo(h: HistoryState, current: LessonDocument): Step | null {
  const entry = h.past[h.past.length - 1]
  if (!entry) return null
  return {
    history: {
      past: h.past.slice(0, -1),
      future: [...h.future, { doc: current, label: entry.label, pageId: entry.pageId }]
    },
    doc: entry.doc,
    pageId: entry.pageId,
    label: entry.label
  }
}

export function redo(h: HistoryState, current: LessonDocument): Step | null {
  const entry = h.future[h.future.length - 1]
  if (!entry) return null
  return {
    history: {
      past: [...h.past, { doc: current, label: entry.label, pageId: entry.pageId }],
      future: h.future.slice(0, -1)
    },
    doc: entry.doc,
    pageId: entry.pageId,
    label: entry.label
  }
}
