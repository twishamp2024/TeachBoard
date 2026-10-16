import { useEffect, useRef, useState } from 'react'
import { FileDown, FolderOpen, Menu as MenuIcon, Minus, PaintBucket, PanelLeft, Play, Plus, Redo2, Save, Settings, Undo2, Maximize } from 'lucide-react'
import { api, isMac } from '../../platform'
import { runCommand } from '../../state/commands'
import { isDirty, useDoc } from '../../state/doc'
import { setTitle } from '../../state/ops'
import { useUi } from '../../state/ui'
import { cx, IconButton, useCommandTip } from '../primitives'
import { useViewportZoom } from './useViewportZoom'

function TitleField() {
  const title = useDoc((s) => s.doc.title)
  const dirty = useDoc((s) => isDirty(s))
  const filePath = useDoc((s) => s.filePath)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(title)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => setValue(title), [title])
  useEffect(() => {
    if (editing) ref.current?.select()
  }, [editing])
  const commit = () => {
    setEditing(false)
    if (value.trim() && value !== title) setTitle(value)
    else setValue(title)
  }
  return (
    <div className="doc-title" title={filePath ?? 'Not saved yet'}>
      {editing ? (
        <input
          ref={ref}
          className="doc-title__input"
          value={value}
          aria-label="Lesson title"
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setValue(title)
              setEditing(false)
            }
          }}
        />
      ) : (
        <button type="button" className="doc-title__btn" onClick={() => setEditing(true)} data-tip="Rename lesson" aria-label={`Lesson title: ${title}. Click to rename.`}>
          {title}
        </button>
      )}
      <span className={cx('doc-title__status', dirty && 'is-dirty')} aria-live="polite">
        {dirty ? 'Edited' : filePath ? 'Saved' : ''}
      </span>
    </div>
  )
}

function ZoomControl() {
  const { zoom } = useViewportZoom()
  const tipIn = useCommandTip('view.zoomIn')
  const tipOut = useCommandTip('view.zoomOut')
  const tipFit = useCommandTip('view.zoomFit')
  return (
    <div className="zoom-control" role="group" aria-label="Zoom">
      <IconButton label={tipOut} size="s" onClick={() => runCommand('view.zoomOut')}>
        <Minus size={16} />
      </IconButton>
      <button type="button" className="zoom-control__value" onClick={() => runCommand('view.zoom100')} data-tip="Actual size (100%)" aria-label={`Zoom ${Math.round(zoom * 100)}%. Click for 100%.`}>
        {Math.round(zoom * 100)}%
      </button>
      <IconButton label={tipIn} size="s" onClick={() => runCommand('view.zoomIn')}>
        <Plus size={16} />
      </IconButton>
      <IconButton label={tipFit} size="s" onClick={() => runCommand('view.zoomFit')}>
        <Maximize size={15} />
      </IconButton>
    </div>
  )
}

export function TopBar() {
  const canUndo = useDoc((s) => s.history.past.length > 0)
  const canRedo = useDoc((s) => s.history.future.length > 0)
  const drawer = useUi((s) => s.drawer)
  const pagesOpen = useUi((s) => s.pagesOpen)
  const tips = {
    undo: useCommandTip('edit.undo'),
    redo: useCommandTip('edit.redo'),
    save: useCommandTip('file.save'),
    open: useCommandTip('file.open'),
    present: useCommandTip('view.present', 'Present'),
    pages: useCommandTip('view.togglePages', 'Pages panel'),
    bg: useCommandTip('page.background', 'Page background'),
    exportPdf: useCommandTip('file.exportPdf', 'Export'),
    settings: useCommandTip('app.settings', 'Settings')
  }
  return (
    <header className="topbar">
      <div className="topbar__left">
        {!isMac && (
          <IconButton
            label="Menu"
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              api.popupAppMenu(r.left, r.bottom + 4)
            }}
          >
            <MenuIcon size={18} />
          </IconButton>
        )}
        <IconButton label={tips.pages} active={pagesOpen} onClick={() => runCommand('view.togglePages')}>
          <PanelLeft size={18} />
        </IconButton>
        <div className="topbar__divider" />
        <IconButton label={tips.open} onClick={() => runCommand('file.open')}>
          <FolderOpen size={18} />
        </IconButton>
        <IconButton label={tips.save} onClick={() => runCommand('file.save')}>
          <Save size={18} />
        </IconButton>
        <TitleField />
      </div>
      <div className="topbar__center">
        <IconButton label={tips.undo} disabled={!canUndo} onClick={() => runCommand('edit.undo')}>
          <Undo2 size={18} />
        </IconButton>
        <IconButton label={tips.redo} disabled={!canRedo} onClick={() => runCommand('edit.redo')}>
          <Redo2 size={18} />
        </IconButton>
        <div className="topbar__divider" />
        <ZoomControl />
      </div>
      <div className="topbar__right">
        <IconButton label={tips.bg} active={drawer === 'background'} onClick={() => runCommand('page.background')}>
          <PaintBucket size={18} />
        </IconButton>
        <IconButton label={tips.exportPdf} onClick={() => runCommand('file.exportPdf')}>
          <FileDown size={18} />
        </IconButton>
        <IconButton label={tips.settings} onClick={() => runCommand('app.settings')}>
          <Settings size={18} />
        </IconButton>
        <button type="button" className="btn btn--primary present-btn" onClick={() => runCommand('view.present')} data-tip={tips.present}>
          <Play size={15} fill="currentColor" />
          <span>Present</span>
        </button>
      </div>
    </header>
  )
}
