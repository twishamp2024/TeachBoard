import { useEffect, useRef, useState } from 'react'
import type { TableObject } from '../../core/model'
import { fontCss, LINE_HEIGHT, TEXT_PADDING } from '../../core/text'
import type { Viewport } from '../../core/viewport'
import { currentPage, useDoc } from '../../state/doc'
import { tableEdit } from '../../state/ops'
import { useUi } from '../../state/ui'
import { cancelTextEdit, finishTextEdit, updateTextDraft } from '../../tools/textTools'

/** Inline editor for text objects; its layout mirrors the canvas text renderer. */
export function TextEditor({ viewport }: { viewport: Viewport }) {
  const te = useUi((s) => s.textEdit)
  const ref = useRef<HTMLTextAreaElement>(null)
  const id = te?.draft.id

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus({ preventScroll: true })
    el.setSelectionRange(el.value.length, el.value.length)
  }, [id])

  if (!te) return null
  const d = te.draft
  const z = viewport.zoom
  const minH = d.fontSize * LINE_HEIGHT + TEXT_PADDING * 2
  return (
    <textarea
      ref={ref}
      className="text-editor"
      aria-label="Edit text"
      spellCheck={false}
      value={d.text}
      onChange={(e) => updateTextDraft({ text: e.target.value })}
      onBlur={(e) => {
        // Formatting controls keep the editor open.
        if ((e.relatedTarget as HTMLElement | null)?.closest('[data-keep-text-edit]')) return
        finishTextEdit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          if (te.isNew && !d.text.trim()) cancelTextEdit()
          else finishTextEdit()
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          finishTextEdit()
        }
      }}
      style={{
        left: d.x * z + viewport.panX,
        top: d.y * z + viewport.panY,
        width: d.w * z,
        height: Math.max(d.h, minH) * z,
        padding: TEXT_PADDING * z,
        fontFamily: fontCss(d.fontFamily),
        fontSize: d.fontSize * z,
        fontWeight: d.bold ? 700 : 400,
        fontStyle: d.italic ? 'italic' : 'normal',
        textDecoration: d.underline ? 'underline' : 'none',
        lineHeight: LINE_HEIGHT,
        textAlign: d.align,
        color: d.color,
        background: d.background ?? 'transparent'
      }}
    />
  )
}

/** Inline editor for a table cell. Tab/Shift+Tab move between cells. */
export function CellEditor({ viewport }: { viewport: Viewport }) {
  const cell = useUi((s) => s.cellEdit)
  const table = useDoc((s) => currentPage(s).objects.find((o) => o.id === cell?.tableId)) as TableObject | undefined
  const ref = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState('')
  const committed = useRef(false)

  useEffect(() => {
    if (!table || !cell) return
    setValue(table.cells[cell.row]?.[cell.col] ?? '')
    committed.current = false
    requestAnimationFrame(() => {
      ref.current?.focus({ preventScroll: true })
      ref.current?.select()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell?.tableId, cell?.row, cell?.col])

  if (!cell || !table) return null
  const z = viewport.zoom
  const x = table.x + table.colWidths.slice(0, cell.col).reduce((a, b) => a + b, 0)
  const y = table.y + table.rowHeights.slice(0, cell.row).reduce((a, b) => a + b, 0)
  const w = table.colWidths[cell.col]
  const h = table.rowHeights[cell.row]

  const commit = () => {
    if (committed.current) return
    committed.current = true
    if ((table.cells[cell.row]?.[cell.col] ?? '') !== value) {
      tableEdit(table.id, 'Edit table', (t) => {
        const cells = t.cells.map((r) => r.slice())
        cells[cell.row][cell.col] = value
        // Grow the row so the text fits.
        const lines = Math.max(1, value.split('\n').length)
        const rowHeights = t.rowHeights.slice()
        rowHeights[cell.row] = Math.max(rowHeights[cell.row], lines * t.fontSize * LINE_HEIGHT + 16)
        return { ...t, cells, rowHeights }
      })
    }
  }

  const move = (dc: number) => {
    commit()
    const cols = table.colWidths.length
    const rows = table.rowHeights.length
    let idx = cell.row * cols + cell.col + dc
    idx = Math.max(0, Math.min(rows * cols - 1, idx))
    useUi.getState().set({ cellEdit: { tableId: table.id, row: Math.floor(idx / cols), col: idx % cols } })
  }

  return (
    <textarea
      ref={ref}
      className="cell-editor"
      aria-label={`Edit cell row ${cell.row + 1}, column ${cell.col + 1}`}
      value={value}
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        commit()
        if (useUi.getState().cellEdit === cell) useUi.getState().set({ cellEdit: null })
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          committed.current = true
          useUi.getState().set({ cellEdit: null })
        } else if (e.key === 'Tab') {
          e.preventDefault()
          move(e.shiftKey ? -1 : 1)
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          move(table.colWidths.length)
        }
      }}
      style={{
        left: x * z + viewport.panX,
        top: y * z + viewport.panY,
        width: w * z,
        height: h * z,
        fontSize: table.fontSize * z,
        fontFamily: fontCss(table.fontFamily),
        lineHeight: LINE_HEIGHT,
        color: table.color,
        padding: `${Math.max(2, (h * z - table.fontSize * z * LINE_HEIGHT) / 2)}px ${8 * z}px 0`
      }}
    />
  )
}
