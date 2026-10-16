import { useEffect, useState } from 'react'
import { FileDown, Printer } from 'lucide-react'
import { COMMANDS, type CommandCategory } from '../../../../shared/commands'
import { objectBounds, unionRects } from '../../core/geometry'
import type { ImageObject } from '../../core/model'
import { findPresetFor, MAX_PAGE_SIZE, MIN_PAGE_SIZE, PAGE_SIZE_PRESETS } from '../../core/model'
import { drawObject } from '../../core/render'
import { resources } from '../../core/resources'
import { formatBinding } from '../../core/shortcuts'
import type { RecoveryEntry } from '../../../../shared/ipc'
import { api, APP_NAME, APP_VERSION, isMac } from '../../platform'
import { currentPage, useDoc } from '../../state/doc'
import { exportAsImage, exportAsPdf, printDocument, restoreRecovery, type PageRange } from '../../state/files'
import { toLibraryAssets, useLibrary } from '../../state/library'
import { getSelectedObjects, insertTable, setPageSize, type Scope } from '../../state/ops'
import { useUi } from '../../state/ui'
import { Button, Dialog, Field, Segmented } from '../primitives'
import { useKeymap } from '../useKeymap'
import { MathDialog } from './MathDialog'
import { SettingsDialog } from './SettingsDialog'
import appConfig from '../../../../../app.config.json'
import iconUrl from '../../assets/icon.png'

function close() {
  useUi.getState().closeDialog()
}

function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm }: { title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void }) {
  return (
    <Dialog
      title={title}
      onClose={close}
      width={420}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            data-autofocus
            onClick={() => {
              close()
              onConfirm()
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="dialog__text">{message}</p>
    </Dialog>
  )
}

function PromptDialog({ title, label, value, submitLabel, onSubmit }: { title: string; label: string; value: string; submitLabel: string; onSubmit: (v: string) => void }) {
  const [v, setV] = useState(value)
  const submit = () => {
    if (!v.trim()) return
    close()
    onSubmit(v.trim())
  }
  return (
    <Dialog
      title={title}
      onClose={close}
      width={400}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!v.trim()}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <Field label={label}>
        <input className="input" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} data-autofocus />
      </Field>
    </Dialog>
  )
}

function TableDialog() {
  const [rows, setRows] = useState(4)
  const [cols, setCols] = useState(3)
  const ok = () => {
    close()
    insertTable(Math.max(1, Math.min(30, rows)), Math.max(1, Math.min(12, cols)))
  }
  return (
    <Dialog
      title="Insert Table"
      onClose={close}
      width={380}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={ok}>
            Insert
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Rows">
          <input className="input" type="number" min={1} max={30} value={rows} onChange={(e) => setRows(Number(e.target.value))} data-autofocus />
        </Field>
        <Field label="Columns">
          <input className="input" type="number" min={1} max={12} value={cols} onChange={(e) => setCols(Number(e.target.value))} />
        </Field>
      </div>
      <p className="dialog__hint">Double-click a cell to type. Tab moves to the next cell; right-click for rows and columns.</p>
    </Dialog>
  )
}

function PageSetupDialog() {
  const page = useDoc((s) => currentPage(s))
  const [w, setW] = useState(page.width)
  const [h, setH] = useState(page.height)
  const [scope, setScope] = useState<Scope>('page')
  const [scale, setScale] = useState(false)
  const preset = findPresetFor(w, h)?.id ?? 'custom'
  const valid = w >= MIN_PAGE_SIZE && h >= MIN_PAGE_SIZE && w <= MAX_PAGE_SIZE && h <= MAX_PAGE_SIZE
  return (
    <Dialog
      title="Page Size"
      onClose={close}
      width={460}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => {
              close()
              setPageSize(Math.round(w), Math.round(h), scope, scale)
            }}
          >
            Apply
          </Button>
        </>
      }
    >
      <Field label="Size">
        <select
          className="select select--wide"
          value={preset}
          data-autofocus
          onChange={(e) => {
            const p = PAGE_SIZE_PRESETS.find((x) => x.id === e.target.value)
            if (p) {
              setW(p.width)
              setH(p.height)
            }
          }}
        >
          {PAGE_SIZE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} ({p.width} × {p.height})
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </Field>
      <div className="form-grid">
        <Field label="Width (px)">
          <input className="input" type="number" min={MIN_PAGE_SIZE} max={MAX_PAGE_SIZE} value={w} onChange={(e) => setW(Number(e.target.value))} />
        </Field>
        <Field label="Height (px)">
          <input className="input" type="number" min={MIN_PAGE_SIZE} max={MAX_PAGE_SIZE} value={h} onChange={(e) => setH(Number(e.target.value))} />
        </Field>
      </div>
      {!valid && <p className="dialog__error">Width and height must be between {MIN_PAGE_SIZE} and {MAX_PAGE_SIZE} pixels.</p>}
      <Field label="Apply to">
        <Segmented<Scope>
          label="Apply to"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'page', label: 'This page' },
            { value: 'section', label: 'This section' },
            { value: 'all', label: 'All pages' }
          ]}
        />
      </Field>
      <label className="check">
        <input type="checkbox" checked={scale} onChange={(e) => setScale(e.target.checked)} />
        Scale page content to fit the new size
      </label>
    </Dialog>
  )
}

function ExportDialog({ format }: { format: 'pdf' | 'png' | 'jpeg' | 'png-all' }) {
  const [kind, setKind] = useState<'pdf' | 'png' | 'jpeg'>(format === 'png-all' ? 'png' : format)
  const [range, setRange] = useState<PageRange>(format === 'pdf' || format === 'png-all' ? 'all' : 'current')
  const [scale, setScale] = useState(2)
  const total = useDoc((s) => s.doc.sections.reduce((n, x) => n + x.pages.length, 0))
  const go = () => {
    close()
    if (kind === 'pdf') void exportAsPdf(range, scale)
    else void exportAsImage(kind, range, scale)
  }
  return (
    <Dialog
      title="Export"
      onClose={close}
      width={460}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              close()
              void printDocument(range)
            }}
          >
            <Printer size={15} /> Print…
          </Button>
          <span className="spacer" />
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={go} data-autofocus>
            <FileDown size={15} /> Export
          </Button>
        </>
      }
    >
      <Field label="Format">
        <Segmented
          label="Format"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'pdf', label: 'PDF' },
            { value: 'png', label: 'PNG' },
            { value: 'jpeg', label: 'JPEG' }
          ]}
        />
      </Field>
      <Field label="Pages">
        <Segmented<PageRange>
          label="Pages"
          value={range}
          onChange={setRange}
          options={[
            { value: 'current', label: 'Current page' },
            { value: 'section', label: 'This section' },
            { value: 'all', label: `All ${total} pages` }
          ]}
        />
      </Field>
      <Field label="Quality" hint="Exports are rendered from the lesson itself, independent of the current zoom.">
        <Segmented
          label="Quality"
          value={String(scale)}
          onChange={(v) => setScale(Number(v))}
          options={[
            { value: '1', label: 'Standard (1×)' },
            { value: '2', label: 'High (2×)' },
            { value: '3', label: 'Print (3×)' }
          ]}
        />
      </Field>
      {kind !== 'pdf' && range !== 'current' && <p className="dialog__hint">Each page is saved as a separate image in a folder you choose.</p>}
    </Dialog>
  )
}

function RecoveryDialog() {
  const [entries, setEntries] = useState<RecoveryEntry[]>([])
  useEffect(() => {
    void api.listRecovery().then(setEntries)
  }, [])
  const discardAll = async () => {
    for (const e of entries) await api.clearRecovery(e.id)
    close()
  }
  return (
    <Dialog
      title="Recover Unsaved Work"
      onClose={close}
      width={500}
      footer={
        <>
          <Button variant="ghost" onClick={discardAll}>
            Discard all
          </Button>
          <span className="spacer" />
          <Button onClick={close}>Decide later</Button>
        </>
      }
    >
      <p className="dialog__text">{APP_NAME} closed before these lessons were saved. Recovered lessons open as new, unsaved copies so your original files are never overwritten.</p>
      <ul className="recovery-list">
        {entries.map((e) => (
          <li key={e.id}>
            <div>
              <strong>{e.title}</strong>
              <small>
                {new Date(e.savedAt).toLocaleString()}
                {e.originalPath ? ` · ${e.originalPath}` : ' · never saved'}
              </small>
            </div>
            <Button
              variant="primary"
              small
              onClick={() => {
                close()
                void restoreRecovery(e.id)
              }}
            >
              Recover
            </Button>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}

function SaveToLibraryDialog() {
  const lib = useLibrary()
  const [name, setName] = useState('')
  const [groupId, setGroupId] = useState('')
  useEffect(() => {
    void lib.load().then(() => setGroupId((g) => g || useLibrary.getState().groups[0]?.id || ''))
  }, [lib])
  const objs = getSelectedObjects()
  const save = async () => {
    if (!objs.length) return
    const doc = useDoc.getState().doc
    const assetIds = new Set(objs.filter((o): o is ImageObject => o.type === 'image').map((o) => o.assetId))
    const assets = [...assetIds].map((id) => doc.assets[id]).filter(Boolean)
    // Render a preview tile.
    await resources.ensurePages(doc, [{ id: 'p', width: 1, height: 1, background: currentPage(useDoc.getState()).background, objects: objs }])
    const b = unionRects(objs.map(objectBounds))!
    const k = Math.min(2, 160 / Math.max(b.w, b.h))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.ceil(b.w * k))
    c.height = Math.max(1, Math.ceil(b.h * k))
    const ctx = c.getContext('2d')!
    ctx.setTransform(k, 0, 0, k, -b.x * k, -b.y * k)
    for (const o of objs) drawObject(ctx, o, { doc, resources })
    let gid = groupId
    if (!gid) gid = lib.addGroup('My Resources')
    lib.addItem(gid, { name: name.trim() || 'Untitled resource', preview: c.toDataURL('image/png'), objects: structuredClone(objs), assets: toLibraryAssets(assets) })
    close()
    useUi.getState().toast('Saved to your library.', 'success')
  }
  return (
    <Dialog
      title="Save to Library"
      onClose={close}
      width={420}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!objs.length}>
            Save
          </Button>
        </>
      }
    >
      <Field label="Name">
        <input className="input" value={name} placeholder="e.g. Series circuit" onChange={(e) => setName(e.target.value)} data-autofocus />
      </Field>
      <Field label="Group">
        <select className="select select--wide" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          {lib.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>
      <p className="dialog__hint">
        {objs.length} object{objs.length === 1 ? '' : 's'} will be saved and stay editable when inserted into any lesson.
      </p>
    </Dialog>
  )
}

function AboutDialog() {
  return (
    <Dialog title={`About ${APP_NAME}`} onClose={close} width={420} footer={<Button variant="primary" onClick={close}>Close</Button>}>
      <div className="about">
        <img className="about__logo" src={iconUrl} alt="" width={88} height={88} />
        <h3>{APP_NAME}</h3>
        <p>Version {APP_VERSION}</p>
        <p className="dialog__text">{appConfig.description}</p>
        <p className="dialog__hint">{appConfig.copyright}</p>
        <p className="dialog__hint">
          Lessons are stored on this computer as .{appConfig.fileExtension} files. No account or internet connection is needed.
        </p>
      </div>
    </Dialog>
  )
}

function ShortcutsDialog() {
  const keymap = useKeymap()
  const cats: CommandCategory[] = ['File', 'Edit', 'View', 'Tools', 'Insert', 'Page', 'Teaching', 'Help']
  return (
    <Dialog
      title="Keyboard Shortcuts"
      onClose={close}
      width={720}
      footer={
        <>
          <Button variant="ghost" onClick={() => useUi.getState().openDialog({ kind: 'settings', tab: 'shortcuts' })}>
            Customise…
          </Button>
          <span className="spacer" />
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        </>
      }
    >
      <div className="shortcut-sheet">
        {cats.map((cat) => {
          const cmds = COMMANDS.filter((c) => c.category === cat && keymap[c.id]?.length)
          if (!cmds.length) return null
          return (
            <section key={cat}>
              <h3>{cat}</h3>
              {cmds.map((c) => (
                <div key={c.id} className="shortcut-row">
                  <span>{c.label}</span>
                  <span className="keys">
                    {keymap[c.id].map((k) => (
                      <kbd key={k}>{formatBinding(k, isMac)}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </section>
          )
        })}
        <section>
          <h3>Canvas</h3>
          <div className="shortcut-row">
            <span>Pan while held</span>
            <span className="keys">
              <kbd>Space</kbd>
            </span>
          </div>
          <div className="shortcut-row">
            <span>Zoom</span>
            <span className="keys">
              <kbd>{isMac ? '⌘' : 'Ctrl'} + scroll</kbd>
            </span>
          </div>
          <div className="shortcut-row">
            <span>Nudge selection</span>
            <span className="keys">
              <kbd>←↑→↓</kbd>
            </span>
          </div>
          <div className="shortcut-row">
            <span>Straight line while drawing</span>
            <span className="keys">
              <kbd>Shift</kbd>
            </span>
          </div>
          <div className="shortcut-row">
            <span>Deselect / cancel</span>
            <span className="keys">
              <kbd>Esc</kbd>
            </span>
          </div>
        </section>
      </div>
    </Dialog>
  )
}

export function Dialogs() {
  const dialog = useUi((s) => s.dialog)
  if (!dialog) return null
  switch (dialog.kind) {
    case 'confirm':
      return <ConfirmDialog {...dialog} />
    case 'prompt':
      return <PromptDialog {...dialog} />
    case 'table':
      return <TableDialog />
    case 'pageSetup':
      return <PageSetupDialog />
    case 'export':
      return <ExportDialog format={dialog.format} />
    case 'recovery':
      return <RecoveryDialog />
    case 'saveToLibrary':
      return <SaveToLibraryDialog />
    case 'about':
      return <AboutDialog />
    case 'shortcuts':
      return <ShortcutsDialog />
    case 'math':
      return <MathDialog editId={dialog.editId} at={dialog.at} />
    case 'settings':
      return <SettingsDialog initialTab={dialog.tab} />
    default:
      return null
  }
}
