import { ArrowDownToLine, ArrowUpToLine, ClipboardPaste, Copy, CopyPlus, Image, Library, PaintBucket, Scissors, Trash2 } from 'lucide-react'
import { COMMAND_MAP } from '../../../../shared/commands'
import { formatBinding } from '../../core/shortcuts'
import { isMac } from '../../platform'
import { runCommand } from '../../state/commands'
import { currentPage, useDoc } from '../../state/doc'
import { tableDeleteCol, tableDeleteRow, tableEdit, tableInsertCol, tableInsertRow } from '../../state/ops'
import { useUi } from '../../state/ui'
import { ContextMenu, type MenuItem } from '../primitives'
import { currentKeymap } from '../useKeymap'
import { pickObject } from '../../tools/selectTool'

export function CanvasContextMenu({ x, y, at, onClose }: { x: number; y: number; at: { x: number; y: number }; onClose: () => void }) {
  const keymap = currentKeymap()
  const s = useDoc.getState()
  const page = currentPage(s)
  // Right-clicking an unselected object selects it first.
  const hit = pickObject(page.objects, at.x, at.y, 6)
  if (hit && !s.selection.includes(hit.id)) {
    s.setSelection([hit.id])
    useUi.getState().setTool('select')
  }
  const hasSel = useDoc.getState().selection.length > 0
  const item = (id: string, icon?: React.ReactNode, extra: Partial<MenuItem> = {}): MenuItem => ({
    label: COMMAND_MAP[id]?.label ?? id,
    shortcut: keymap[id]?.[0] ? formatBinding(keymap[id][0], isMac) : undefined,
    onSelect: () => runCommand(id),
    icon,
    ...extra
  })

  const items: MenuItem[] = []
  if (hasSel) {
    items.push(item('edit.cut', <Scissors size={15} />), item('edit.copy', <Copy size={15} />), item('edit.paste', <ClipboardPaste size={15} />), item('edit.duplicate', <CopyPlus size={15} />))
    items.push({ separator: true, label: '' })
    items.push(item('edit.bringToFront', <ArrowUpToLine size={15} />), item('edit.bringForward'), item('edit.sendBackward'), item('edit.sendToBack', <ArrowDownToLine size={15} />))
    if (hit?.type === 'table') {
      const t = hit
      let col = 0
      let row = 0
      let acc = t.x
      t.colWidths.forEach((w, i) => {
        if (at.x >= acc && at.x < acc + w) col = i
        acc += w
      })
      acc = t.y
      t.rowHeights.forEach((h, i) => {
        if (at.y >= acc && at.y < acc + h) row = i
        acc += h
      })
      items.push({ separator: true, label: '' })
      items.push(
        { label: 'Insert Row Above', onSelect: () => tableEdit(t.id, 'Insert row', (o) => tableInsertRow(o, row)) },
        { label: 'Insert Row Below', onSelect: () => tableEdit(t.id, 'Insert row', (o) => tableInsertRow(o, row + 1)) },
        { label: 'Insert Column Left', onSelect: () => tableEdit(t.id, 'Insert column', (o) => tableInsertCol(o, col)) },
        { label: 'Insert Column Right', onSelect: () => tableEdit(t.id, 'Insert column', (o) => tableInsertCol(o, col + 1)) },
        { label: 'Delete Row', disabled: t.rowHeights.length <= 1, onSelect: () => tableEdit(t.id, 'Delete row', (o) => tableDeleteRow(o, row)) },
        { label: 'Delete Column', disabled: t.colWidths.length <= 1, onSelect: () => tableEdit(t.id, 'Delete column', (o) => tableDeleteCol(o, col)) }
      )
    }
    items.push({ separator: true, label: '' })
    items.push(item('edit.saveToLibrary', <Library size={15} />))
    items.push(item('edit.delete', <Trash2 size={15} />, { danger: true }))
  } else {
    items.push(item('edit.paste', <ClipboardPaste size={15} />), item('edit.selectAll'))
    items.push({ separator: true, label: '' })
    items.push(item('insert.image', <Image size={15} />), item('insert.table'), item('insert.math'))
    items.push({ separator: true, label: '' })
    items.push(item('page.background', <PaintBucket size={15} />), item('page.setup'), item('page.new'), item('page.duplicate'))
    items.push({ separator: true, label: '' })
    items.push(item('page.clear', undefined, { danger: true, disabled: page.objects.length === 0 }))
  }
  return <ContextMenu x={x} y={y} items={items} onClose={onClose} />
}
