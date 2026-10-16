import { hitTest } from '../core/geometry'
import type { TextObject } from '../core/model'
import { currentPage, onPage, useDoc } from '../state/doc'
import { createTextObject, relayout } from '../state/ops'
import { useUi } from '../state/ui'
import type { PointerSample, Tool, ToolContext } from './types'

export function beginTextEdit(obj: TextObject, isNew: boolean): void {
  const ui = useUi.getState()
  if (ui.textEdit) finishTextEdit()
  useDoc.getState().setSelection(isNew ? [] : [obj.id])
  ui.set({ textEdit: { draft: obj, isNew } })
}

/** Updates the text being edited (content or formatting). */
export function updateTextDraft(patch: Partial<TextObject>): void {
  const te = useUi.getState().textEdit
  if (!te) return
  useUi.getState().set({ textEdit: { ...te, draft: relayout({ ...te.draft, ...patch }) } })
}

/** Commits the inline editor's content as a single undoable change. */
export function finishTextEdit(): void {
  const ui = useUi.getState()
  const te = ui.textEdit
  if (!te) return
  ui.set({ textEdit: null })
  const doc = useDoc.getState()
  const draft = relayout({ ...te.draft, text: te.draft.text.replace(/\s+$/, '') })
  const empty = draft.text.trim() === ''
  if (te.isNew) {
    if (empty) return
    doc.commit(
      'Add text',
      onPage(doc.pageId, (p) => {
        p.objects.push(draft)
      }),
      { select: [draft.id] }
    )
    return
  }
  const original = currentPage(doc).objects.find((o) => o.id === draft.id)
  if (!original) return
  if (empty) {
    doc.commit(
      'Delete text',
      onPage(doc.pageId, (p) => {
        p.objects = p.objects.filter((o) => o.id !== draft.id)
      }),
      { select: [] }
    )
    return
  }
  if (JSON.stringify(original) === JSON.stringify(draft)) return
  doc.commit(
    'Edit text',
    onPage(doc.pageId, (p) => {
      const i = p.objects.findIndex((o) => o.id === draft.id)
      if (i >= 0) p.objects[i] = draft
    }),
    { select: [draft.id] }
  )
}

export function cancelTextEdit(): void {
  useUi.getState().set({ textEdit: null })
}

export class TextTool implements Tool {
  readonly cursor = 'text'
  private start: PointerSample | null = null

  active(): boolean {
    return !!this.start
  }

  down(p: PointerSample, ctx: ToolContext): void {
    if (useUi.getState().textEdit) {
      finishTextEdit()
    }
    const page = currentPage(useDoc.getState())
    const tol = 4 / ctx.viewport.zoom
    for (let i = page.objects.length - 1; i >= 0; i--) {
      const o = page.objects[i]
      if (o.type === 'text' && hitTest(o, p.x, p.y, tol)) {
        beginTextEdit(o, false)
        return
      }
    }
    this.start = p
  }
  move(): void {}
  up(p: PointerSample, ctx: ToolContext): void {
    const start = this.start
    this.start = null
    if (!start) return
    const page = currentPage(useDoc.getState())
    const dragW = Math.abs(p.x - start.x)
    const w = dragW * ctx.viewport.zoom > 24 ? dragW : undefined
    const x = Math.min(start.x, p.x)
    const obj = createTextObject(x, start.y - 8, w)
    // Keep new text on the page.
    obj.w = Math.min(obj.w, Math.max(60, page.width - x - 8))
    beginTextEdit(obj, true)
  }
  cancel(): void {
    this.start = null
  }
}

export class MathTool implements Tool {
  readonly cursor = 'copy'
  active(): boolean {
    return false
  }
  down(p: PointerSample, ctx: ToolContext): void {
    const page = currentPage(useDoc.getState())
    const tol = 4 / ctx.viewport.zoom
    for (let i = page.objects.length - 1; i >= 0; i--) {
      const o = page.objects[i]
      if (o.type === 'math' && hitTest(o, p.x, p.y, tol)) {
        useUi.getState().openDialog({ kind: 'math', editId: o.id })
        return
      }
    }
    useUi.getState().openDialog({ kind: 'math', at: { x: p.x, y: p.y } })
  }
  move(): void {}
  up(): void {}
  cancel(): void {}
}

export class PanTool implements Tool {
  readonly cursor = 'grab'
  private last: PointerSample | null = null
  active(): boolean {
    return !!this.last
  }
  down(p: PointerSample, ctx: ToolContext): void {
    this.last = p
    ctx.setCursor('grabbing')
  }
  move(p: PointerSample, _s: PointerSample[], ctx: ToolContext): void {
    if (!this.last) return
    const v = ctx.viewport
    ctx.setViewport({ ...v, panX: v.panX + (p.sx - this.last.sx), panY: v.panY + (p.sy - this.last.sy) })
    this.last = p
  }
  up(_p: PointerSample, ctx: ToolContext): void {
    this.last = null
    ctx.setCursor('grab')
  }
  cancel(): void {
    this.last = null
  }
}
