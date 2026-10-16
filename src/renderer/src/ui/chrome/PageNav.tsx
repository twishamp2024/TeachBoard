import { ChevronLeft, ChevronRight, FilePlus2 } from 'lucide-react'
import { pageCount } from '../../core/document'
import { runCommand } from '../../state/commands'
import { currentPageIndex, useDoc } from '../../state/doc'
import { IconButton, useCommandTip } from '../primitives'

export function PageNav() {
  const index = useDoc((s) => currentPageIndex(s))
  const total = useDoc((s) => pageCount(s.doc))
  const tips = { prev: useCommandTip('page.prev'), next: useCommandTip('page.next'), add: useCommandTip('page.new') }
  return (
    <nav className="page-nav" aria-label="Page navigation">
      <IconButton label={tips.prev} disabled={index === 0} onClick={() => runCommand('page.prev')} tipSide="top">
        <ChevronLeft size={18} />
      </IconButton>
      <span className="page-nav__count" aria-live="polite">
        <strong>{index + 1}</strong> / {total}
      </span>
      <IconButton label={tips.next} disabled={index >= total - 1} onClick={() => runCommand('page.next')} tipSide="top">
        <ChevronRight size={18} />
      </IconButton>
      <div className="page-nav__divider" />
      <IconButton label={tips.add} onClick={() => runCommand('page.new')} tipSide="top">
        <FilePlus2 size={17} />
      </IconButton>
    </nav>
  )
}
