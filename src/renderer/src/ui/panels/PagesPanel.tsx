import { useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, FolderPlus, MoreHorizontal, Plus } from 'lucide-react'
import { allPages, pageCount } from '../../core/document'
import type { Id, Section } from '../../core/model'
import { runCommand } from '../../state/commands'
import { useDoc } from '../../state/doc'
import {
  addPageToSection,
  addSection,
  deletePage,
  deleteSection,
  duplicatePage,
  moveSection,
  movePage,
  renameSection,
  toggleSectionCollapsed
} from '../../state/ops'
import { useSettings } from '../../state/settings'
import { useUi } from '../../state/ui'
import { ContextMenu, cx, IconButton, type MenuItem } from '../primitives'
import { Thumbnail } from './Thumbnail'

const DRAG_TYPE = 'application/x-tb-page'

function SectionHeader({ section, index, total }: { section: Section; index: number; total: number }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(section.name)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [dropHover, setDropHover] = useState(false)
  const docPages = useDoc((s) => pageCount(s.doc))
  const items: MenuItem[] = [
    { label: 'Rename Section', onSelect: () => setEditing(true) },
    { label: 'Add Page to Section', onSelect: () => addPageToSection(section.id) },
    { separator: true, label: '' },
    { label: 'Move Section Up', disabled: index === 0, onSelect: () => moveSection(section.id, -1) },
    { label: 'Move Section Down', disabled: index === total - 1, onSelect: () => moveSection(section.id, 1) },
    { separator: true, label: '' },
    { label: 'Remove Section (keep pages)', disabled: total <= 1, onSelect: () => deleteSection(section.id, true) },
    {
      label: 'Delete Section and Its Pages…',
      danger: true,
      disabled: total <= 1 || docPages - section.pages.length < 1,
      onSelect: () =>
        useUi.getState().openDialog({
          kind: 'confirm',
          title: `Delete “${section.name}”?`,
          message: `The section and its ${section.pages.length} page${section.pages.length === 1 ? '' : 's'} will be removed. You can undo this.`,
          confirmLabel: 'Delete Section',
          danger: true,
          onConfirm: () => deleteSection(section.id, false)
        })
    }
  ]
  return (
    <div
      className={cx('section-head', dropHover && 'is-drop')}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_TYPE)) {
          e.preventDefault()
          setDropHover(true)
        }
      }}
      onDragLeave={() => setDropHover(false)}
      onDrop={(e) => {
        setDropHover(false)
        const id = e.dataTransfer.getData(DRAG_TYPE)
        if (id) movePage(id, section.id, section.pages.length)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
    >
      <button type="button" className="section-head__toggle" onClick={() => toggleSectionCollapsed(section.id)} aria-expanded={!section.collapsed} aria-label={`${section.collapsed ? 'Expand' : 'Collapse'} ${section.name}`}>
        {section.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      </button>
      {editing ? (
        <input
          className="section-head__input"
          autoFocus
          value={name}
          aria-label="Section name"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            setEditing(false)
            renameSection(section.id, name)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              setName(section.name)
              setEditing(false)
            }
          }}
        />
      ) : (
        <span className="section-head__name" onDoubleClick={() => setEditing(true)} title="Double-click to rename">
          {section.name}
        </span>
      )}
      <span className="section-head__count">{section.pages.length}</span>
      <IconButton label="Section options" size="s" onClick={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        setMenu({ x: r.left, y: r.bottom + 4 })
      }}>
        <MoreHorizontal size={15} />
      </IconButton>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </div>
  )
}

export function PagesPanel() {
  const sections = useDoc((s) => s.doc.sections)
  const pageId = useDoc((s) => s.pageId)
  const width = useUi((s) => s.pagesWidth)
  const [menu, setMenu] = useState<{ x: number; y: number; id: Id } | null>(null)
  const [drop, setDrop] = useState<{ id: Id; after: boolean } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const doc = useDoc((s) => s.doc)
  const all = useMemo(() => allPages(doc), [doc])
  const numberOf = useMemo(() => new Map(all.map((p, i) => [p.id, i + 1])), [all])
  const thumbW = width - 44

  const pageMenu = (id: Id): MenuItem[] => [
    { label: 'Duplicate Page', onSelect: () => duplicatePage(id) },
    {
      label: 'Page Background…',
      onSelect: () => {
        useDoc.getState().goToPage(id)
        useUi.getState().setDrawer('background')
      }
    },
    {
      label: 'Page Size…',
      onSelect: () => {
        useDoc.getState().goToPage(id)
        runCommand('page.setup')
      }
    },
    { separator: true, label: '' },
    {
      label: 'Delete Page',
      danger: true,
      disabled: all.length <= 1,
      onSelect: () => {
        const page = all.find((p) => p.id === id)
        if (page && page.objects.length && useSettings.getState().settings.confirmPageDelete) {
          useUi.getState().openDialog({
            kind: 'confirm',
            title: `Delete page ${numberOf.get(id)}?`,
            message: 'The page and everything on it will be removed. You can undo this.',
            confirmLabel: 'Delete Page',
            danger: true,
            onConfirm: () => deletePage(id)
          })
        } else deletePage(id)
      }
    }
  ]

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = all.findIndex((p) => p.id === pageId)
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault()
      useDoc.getState().goToIndex(i + 1)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault()
      useDoc.getState().goToIndex(i - 1)
    }
  }

  return (
    <aside className="pages" style={{ width }} aria-label="Pages">
      <div className="pages__head">
        <span className="pages__title">Pages</span>
        <span className="pages__total">{all.length}</span>
        <div className="pages__actions">
          <IconButton label="New section" size="s" onClick={addSection}>
            <FolderPlus size={16} />
          </IconButton>
          <IconButton label="New page" size="s" onClick={() => runCommand('page.new')}>
            <Plus size={17} />
          </IconButton>
        </div>
      </div>
      <div className="pages__list" ref={listRef} role="listbox" aria-label="Lesson pages" tabIndex={0} onKeyDown={onKeyDown}>
        {sections.map((section, si) => (
          <div key={section.id} className="section">
            {(sections.length > 1 || section.name !== 'Section 1') && <SectionHeader section={section} index={si} total={sections.length} />}
            {!section.collapsed &&
              section.pages.map((page, pi) => {
                const n = numberOf.get(page.id)!
                const isDrop = drop?.id === page.id
                return (
                  <div
                    key={page.id}
                    role="option"
                    aria-selected={page.id === pageId}
                    aria-label={`Page ${n}`}
                    className={cx('thumb', page.id === pageId && 'is-current', isDrop && (drop!.after ? 'drop-after' : 'drop-before'))}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_TYPE, page.id)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragOver={(e) => {
                      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
                      e.preventDefault()
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      setDrop({ id: page.id, after: e.clientY > r.top + r.height / 2 })
                    }}
                    onDragLeave={() => setDrop(null)}
                    onDrop={(e) => {
                      const id = e.dataTransfer.getData(DRAG_TYPE)
                      const after = drop?.after ?? false
                      setDrop(null)
                      if (id && id !== page.id) movePage(id, section.id, pi + (after ? 1 : 0))
                    }}
                    onDragEnd={() => setDrop(null)}
                    onClick={() => useDoc.getState().goToPage(page.id)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setMenu({ x: e.clientX, y: e.clientY, id: page.id })
                    }}
                  >
                    <span className="thumb__num">{n}</span>
                    <div className="thumb__frame">
                      <Thumbnail page={page} width={thumbW} />
                    </div>
                  </div>
                )
              })}
            {!section.collapsed && section.pages.length === 0 && (
              <button type="button" className="section__empty" onClick={() => addPageToSection(section.id)}>
                <Plus size={14} /> Add a page
              </button>
            )}
          </div>
        ))}
        <button type="button" className="pages__add" onClick={() => runCommand('page.new')}>
          <Plus size={16} /> New page
        </button>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={pageMenu(menu.id)} onClose={() => setMenu(null)} />}
    </aside>
  )
}
