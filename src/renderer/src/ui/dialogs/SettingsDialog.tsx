import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, RotateCcw, X } from 'lucide-react'
import { COMMANDS, COMMAND_MAP, type CommandCategory } from '../../../../shared/commands'
import { findPresetFor, PAGE_SIZE_PRESETS, PATTERN_KINDS, type PenStyle } from '../../core/model'
import { assignBinding, bindingFromEvent, clearBinding, findConflicts, formatBinding } from '../../core/shortcuts'
import { FONT_OPTIONS } from '../../core/text'
import { isMac } from '../../platform'
import { ALL_TOOLBAR_ITEMS, DEFAULT_HIGHLIGHTERS, DEFAULT_PALETTE, defaultSettings, useSettings, type AppSettings, type ThemePref, type ToolbarItemId } from '../../state/settings'
import { useUi } from '../../state/ui'
import { Button, cx, Dialog, Field, Segmented, Toggle } from '../primitives'
import { useKeymap } from '../useKeymap'

type Tab = 'general' | 'lessons' | 'drawing' | 'colours' | 'toolbar' | 'shortcuts'

const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'lessons', label: 'New Lessons' },
  { id: 'drawing', label: 'Drawing' },
  { id: 'colours', label: 'Colours' },
  { id: 'toolbar', label: 'Toolbar' },
  { id: 'shortcuts', label: 'Shortcuts' }
]

function useUpdate() {
  return useSettings((s) => s.update)
}

function GeneralTab() {
  const s = useSettings((x) => x.settings)
  const update = useUpdate()
  return (
    <div className="settings-section">
      <Field label="Appearance">
        <Segmented<ThemePref>
          label="Appearance"
          value={s.theme}
          onChange={(v) => update((x) => ({ ...x, theme: v }))}
          options={[
            { value: 'system', label: 'Match system' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' }
          ]}
        />
      </Field>
      <Toggle checked={s.pressure} onChange={(v) => update((x) => ({ ...x, pressure: v }))} label="Pressure-sensitive pen" hint="Line width follows stylus pressure when the device reports it. Mouse input always draws an even line." />
      <Field label="Touch input">
        <Segmented<'draw' | 'pan'>
          label="Touch input"
          value={s.touchAction}
          onChange={(v) => update((x) => ({ ...x, touchAction: v }))}
          options={[
            { value: 'draw', label: 'One finger draws' },
            { value: 'pan', label: 'Touch only pans and zooms' }
          ]}
        />
        <span className="field__hint">Two fingers always pan and pinch-zoom. A stylus always draws.</span>
      </Field>
      <Toggle checked={s.recovery} onChange={(v) => update((x) => ({ ...x, recovery: v }))} label="Crash recovery" hint="Keeps a private backup of unsaved work in the app-data folder. It never overwrites your files." />
      <Toggle checked={s.confirmPageDelete} onChange={(v) => update((x) => ({ ...x, confirmPageDelete: v }))} label="Confirm before deleting pages with content" />
    </div>
  )
}

function LessonsTab() {
  const s = useSettings((x) => x.settings)
  const update = useUpdate()
  const preset = findPresetFor(s.pageSize.width, s.pageSize.height)?.id ?? 'custom'
  return (
    <div className="settings-section">
      <Field label="Default page size">
        <select
          className="select select--wide"
          value={preset}
          onChange={(e) => {
            const p = PAGE_SIZE_PRESETS.find((x) => x.id === e.target.value)
            if (p) update((x) => ({ ...x, pageSize: { width: p.width, height: p.height } }))
          }}
        >
          {PAGE_SIZE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} ({p.width} × {p.height})
            </option>
          ))}
          {preset === 'custom' && <option value="custom">Custom ({s.pageSize.width} × {s.pageSize.height})</option>}
        </select>
      </Field>
      <Field label="Default background colour">
        <input type="color" className="color-input" value={s.background.color} onChange={(e) => update((x) => ({ ...x, background: { ...x.background, color: e.target.value.toUpperCase() } }))} />
      </Field>
      <Field label="Default background pattern">
        <select className="select select--wide" value={s.background.pattern} onChange={(e) => update((x) => ({ ...x, background: { ...x.background, pattern: e.target.value as AppSettings['background']['pattern'] } }))}>
          {PATTERN_KINDS.map((p) => (
            <option key={p} value={p}>
              {p === 'none' ? 'None' : p[0].toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>
      </Field>
      <p className="dialog__hint">These settings apply to new lessons. To change an open lesson, use Page Size and Page Background.</p>
    </div>
  )
}

function DrawingTab() {
  const d = useSettings((x) => x.settings.drawing)
  const upd = useSettings((x) => x.updateDrawing)
  return (
    <div className="settings-section settings-grid">
      <h3>Pen</h3>
      <Field label="Colour">
        <input type="color" className="color-input" value={d.pen.color} onChange={(e) => upd('pen', { color: e.target.value.toUpperCase() })} />
      </Field>
      <Field label="Thickness">
        <input className="input" type="number" min={1} max={60} value={d.pen.width} onChange={(e) => upd('pen', { width: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} />
      </Field>
      <Field label="Type">
        <Segmented<PenStyle>
          label="Pen type"
          value={d.pen.style}
          onChange={(v) => upd('pen', { style: v })}
          options={[
            { value: 'pen', label: 'Pen' },
            { value: 'marker', label: 'Marker' },
            { value: 'dashed', label: 'Dashed' }
          ]}
        />
      </Field>
      <h3>Highlighter</h3>
      <Field label="Colour">
        <input type="color" className="color-input" value={d.highlighter.color} onChange={(e) => upd('highlighter', { color: e.target.value.toUpperCase() })} />
      </Field>
      <Field label="Thickness">
        <input className="input" type="number" min={4} max={80} value={d.highlighter.width} onChange={(e) => upd('highlighter', { width: Math.max(4, Math.min(80, Number(e.target.value) || 4)) })} />
      </Field>
      <span />
      <h3>Eraser</h3>
      <Field label="Size (screen pixels)">
        <input className="input" type="number" min={4} max={200} value={d.eraser.size} onChange={(e) => upd('eraser', { size: Math.max(4, Math.min(200, Number(e.target.value) || 4)) })} />
      </Field>
      <Field label="Mode">
        <Segmented
          label="Eraser mode"
          value={d.eraser.mode}
          onChange={(v) => upd('eraser', { mode: v })}
          options={[
            { value: 'partial', label: 'Partial' },
            { value: 'object', label: 'Whole object' }
          ]}
        />
      </Field>
      <span />
      <h3>Text</h3>
      <Field label="Font">
        <select className="select select--wide" value={d.text.fontFamily} onChange={(e) => upd('text', { fontFamily: e.target.value })}>
          {FONT_OPTIONS.map((f) => (
            <option key={f.family} value={f.family}>
              {f.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Size">
        <input className="input" type="number" min={8} max={300} value={d.text.fontSize} onChange={(e) => upd('text', { fontSize: Math.max(8, Math.min(300, Number(e.target.value) || 8)) })} />
      </Field>
      <Field label="Colour">
        <input type="color" className="color-input" value={d.text.color} onChange={(e) => upd('text', { color: e.target.value.toUpperCase() })} />
      </Field>
      <h3>Shapes &amp; equations</h3>
      <Field label="Shape outline width">
        <input className="input" type="number" min={0} max={40} value={d.shape.strokeWidth} onChange={(e) => upd('shape', { strokeWidth: Math.max(0, Math.min(40, Number(e.target.value) || 0)) })} />
      </Field>
      <Field label="Equation size">
        <input className="input" type="number" min={12} max={300} value={d.math.fontSize} onChange={(e) => upd('math', { fontSize: Math.max(12, Math.min(300, Number(e.target.value) || 12)) })} />
      </Field>
      <span />
      <div className="settings-grid__full">
        <Button
          variant="ghost"
          small
          onClick={() => useSettings.getState().update((x) => ({ ...x, drawing: defaultSettings().drawing }))}
        >
          <RotateCcw size={14} /> Restore drawing defaults
        </Button>
      </div>
    </div>
  )
}

function ColoursTab() {
  const s = useSettings((x) => x.settings)
  const update = useUpdate()
  const setAt = (key: 'palette' | 'highlighterPalette', i: number, c: string) =>
    update((x) => {
      const arr = x[key].slice()
      arr[i] = c.toUpperCase()
      return { ...x, [key]: arr }
    })
  return (
    <div className="settings-section">
      <Field label="Ink palette" hint="Shown for the pen, shapes, lines and text. Click a colour to change it.">
        <div className="palette-edit">
          {s.palette.map((c, i) => (
            <label key={i} className="palette-edit__swatch" style={{ background: c }} aria-label={`Palette colour ${i + 1}`}>
              <input type="color" value={c} onChange={(e) => setAt('palette', i, e.target.value)} />
            </label>
          ))}
        </div>
      </Field>
      <Field label="Highlighter palette">
        <div className="palette-edit">
          {s.highlighterPalette.map((c, i) => (
            <label key={i} className="palette-edit__swatch" style={{ background: c }} aria-label={`Highlighter colour ${i + 1}`}>
              <input type="color" value={c} onChange={(e) => setAt('highlighterPalette', i, e.target.value)} />
            </label>
          ))}
        </div>
      </Field>
      <Button variant="ghost" small onClick={() => update((x) => ({ ...x, palette: [...DEFAULT_PALETTE], highlighterPalette: [...DEFAULT_HIGHLIGHTERS] }))}>
        <RotateCcw size={14} /> Restore default colours
      </Button>
    </div>
  )
}

function ToolbarTab() {
  const tb = useSettings((x) => x.settings.toolbar)
  const update = useUpdate()
  const set = (items: ToolbarItemId[]) => update((x) => ({ ...x, toolbar: { ...x.toolbar, items } }))
  const hidden = ALL_TOOLBAR_ITEMS.filter((i) => !tb.items.includes(i.id))
  const label = (id: ToolbarItemId) => ALL_TOOLBAR_ITEMS.find((i) => i.id === id)?.label ?? id
  return (
    <div className="settings-section">
      <Field label="Position">
        <Segmented<'bottom' | 'left'>
          label="Toolbar position"
          value={tb.position}
          onChange={(v) => update((x) => ({ ...x, toolbar: { ...x.toolbar, position: v } }))}
          options={[
            { value: 'bottom', label: 'Bottom (easy to reach at a board)' },
            { value: 'left', label: 'Left side' }
          ]}
        />
      </Field>
      <div className="toolbar-edit">
        <div>
          <div className="panel-label">Shown, in order</div>
          <ul className="toolbar-edit__list">
            {tb.items.map((id, i) => (
              <li key={id}>
                <span>{label(id)}</span>
                <button type="button" className="icon-btn icon-btn--s" aria-label={`Move ${label(id)} up`} disabled={i === 0} onClick={() => { const a = tb.items.slice(); [a[i - 1], a[i]] = [a[i], a[i - 1]]; set(a) }}>
                  <ArrowUp size={14} />
                </button>
                <button type="button" className="icon-btn icon-btn--s" aria-label={`Move ${label(id)} down`} disabled={i === tb.items.length - 1} onClick={() => { const a = tb.items.slice(); [a[i + 1], a[i]] = [a[i], a[i + 1]]; set(a) }}>
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn--s"
                  aria-label={`Hide ${label(id)}`}
                  disabled={id === 'select' || tb.items.length <= 2}
                  onClick={() => set(tb.items.filter((x) => x !== id))}
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="panel-label">Available</div>
          <ul className="toolbar-edit__list">
            {hidden.map((i) => (
              <li key={i.id}>
                <span>{i.label}</span>
                <Button small onClick={() => set([...tb.items, i.id])}>
                  Add
                </Button>
              </li>
            ))}
            {!hidden.length && <li className="muted">Everything is shown.</li>}
          </ul>
        </div>
      </div>
      <p className="dialog__hint">The Select tool always stays on the toolbar. Hidden tools remain available from the menus and keyboard.</p>
      <Button variant="ghost" small onClick={() => update((x) => ({ ...x, toolbar: defaultSettings().toolbar }))}>
        <RotateCcw size={14} /> Restore default toolbar
      </Button>
    </div>
  )
}

function ShortcutsTab() {
  const overrides = useSettings((x) => x.settings.shortcuts)
  const update = useUpdate()
  const keymap = useKeymap()
  const [recording, setRecording] = useState<string | null>(null)
  const [message, setMessage] = useState<{ cmd: string; text: string; pending?: string } | null>(null)
  const conflicts = findConflicts(keymap)
  const cats: CommandCategory[] = ['File', 'Edit', 'View', 'Tools', 'Insert', 'Page', 'Teaching', 'Help']

  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecording(null)
        return
      }
      const b = bindingFromEvent(e, isMac)
      if (!b) return
      const res = assignBinding(overrides, recording, b, isMac)
      if (res.ok) {
        update((x) => ({ ...x, shortcuts: res.overrides }))
        setMessage(null)
      } else if (res.reason === 'reserved') {
        setMessage({ cmd: recording, text: `${formatBinding(b, isMac)} is reserved by the system.` })
      } else if (res.reason === 'conflict') {
        setMessage({ cmd: recording, text: `${formatBinding(b, isMac)} is already used by “${COMMAND_MAP[res.conflictWith!]?.label}”.`, pending: b })
      }
      setRecording(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, overrides, update])

  return (
    <div className="settings-section shortcuts-edit">
      {conflicts.length > 0 && (
        <p className="dialog__error">
          Conflicting shortcuts: {conflicts.map((c) => `${formatBinding(c.binding, isMac)} (${c.commands.map((id) => COMMAND_MAP[id]?.label).join(', ')})`).join('; ')}
        </p>
      )}
      {cats.map((cat) => (
        <section key={cat}>
          <h3>{cat}</h3>
          {COMMANDS.filter((c) => c.category === cat).map((c) => (
            <div key={c.id} className={cx('shortcut-edit-row', recording === c.id && 'is-recording')}>
              <span className="shortcut-edit-row__label">{c.label}</span>
              <span className="keys">
                {recording === c.id ? (
                  <kbd className="is-recording">Press keys… (Esc to cancel)</kbd>
                ) : keymap[c.id].length ? (
                  keymap[c.id].map((k) => <kbd key={k}>{formatBinding(k, isMac)}</kbd>)
                ) : (
                  <span className="muted">—</span>
                )}
              </span>
              <Button small variant="ghost" onClick={() => setRecording(c.id)}>
                Change
              </Button>
              <button
                type="button"
                className="icon-btn icon-btn--s"
                aria-label={`Remove shortcut for ${c.label}`}
                data-tip={c.essential ? 'Essential commands keep a shortcut' : 'Remove shortcut'}
                disabled={!!c.essential || !keymap[c.id].length}
                onClick={() => {
                  const r = clearBinding(overrides, c.id)
                  if (r.ok) update((x) => ({ ...x, shortcuts: r.overrides }))
                }}
              >
                <X size={14} />
              </button>
              {message?.cmd === c.id && (
                <div className="shortcut-edit-row__msg">
                  {message.text}
                  {message.pending && (
                    <Button
                      small
                      variant="secondary"
                      onClick={() => {
                        const r = assignBinding(overrides, c.id, message.pending!, isMac, true)
                        if (r.ok) {
                          update((x) => ({ ...x, shortcuts: r.overrides }))
                          setMessage(null)
                        } else setMessage({ cmd: c.id, text: 'That shortcut cannot be moved: the other command would be left without a shortcut.' })
                      }}
                    >
                      Use it here instead
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </section>
      ))}
      <Button variant="ghost" small onClick={() => update((x) => ({ ...x, shortcuts: {} }))}>
        <RotateCcw size={14} /> Restore default shortcuts
      </Button>
    </div>
  )
}

export function SettingsDialog({ initialTab }: { initialTab?: string }) {
  const [tab, setTab] = useState<Tab>((TABS.find((t) => t.id === initialTab)?.id ?? 'general') as Tab)
  return (
    <Dialog title="Settings" onClose={() => useUi.getState().closeDialog()} width={780} className="settings-dialog" footer={<Button variant="primary" onClick={() => useUi.getState().closeDialog()}>Done</Button>}>
      <div className="settings">
        <nav className="settings__tabs" role="tablist" aria-orientation="vertical">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={cx('settings__tab', tab === t.id && 'is-active')} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="settings__content" role="tabpanel">
          {tab === 'general' && <GeneralTab />}
          {tab === 'lessons' && <LessonsTab />}
          {tab === 'drawing' && <DrawingTab />}
          {tab === 'colours' && <ColoursTab />}
          {tab === 'toolbar' && <ToolbarTab />}
          {tab === 'shortcuts' && <ShortcutsTab />}
        </div>
      </div>
    </Dialog>
  )
}
