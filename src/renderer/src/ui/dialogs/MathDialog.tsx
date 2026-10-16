import { useMemo, useRef, useState } from 'react'
import { MATH_SYMBOL_GROUPS, MATH_TEMPLATES, renderMath } from '../../core/math'
import type { Id, MathObject } from '../../core/model'
import { currentPage, onPage, useDoc } from '../../state/doc'
import { addObjects, centeredRect, makeMathObject } from '../../state/ops'
import { useSettings } from '../../state/settings'
import { useUi } from '../../state/ui'
import { Button, ColorRow, cx, Dialog } from '../primitives'

export function MathDialog({ editId, at }: { editId?: Id; at?: { x: number; y: number } }) {
  const existing = useDoc((s) => (editId ? (currentPage(s).objects.find((o) => o.id === editId) as MathObject | undefined) : undefined))
  const defaults = useSettings((s) => s.settings.drawing.math)
  const palette = useSettings((s) => s.settings.palette)
  const [latex, setLatex] = useState(existing?.latex ?? '')
  const [color, setColor] = useState(existing?.color ?? defaults.color)
  const [size, setSize] = useState(existing?.fontSize ?? defaults.fontSize)
  const [group, setGroup] = useState(0)
  const ref = useRef<HTMLTextAreaElement>(null)

  const preview = useMemo(() => {
    if (!latex.trim()) return { url: null as string | null, error: null as string | null }
    try {
      const r = renderMath(latex, color, 40)
      return { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(r.svg)}`, error: null, w: r.width, h: r.height }
    } catch (err) {
      return { url: null, error: err instanceof Error ? err.message : String(err) }
    }
  }, [latex, color])

  const insert = (text: string, caret?: number) => {
    const el = ref.current
    if (!el) {
      setLatex((l) => l + text)
      return
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = latex.slice(start, end)
    // Wrap the current selection into the first empty {} when possible.
    let ins = text
    let pos = start + (caret ?? text.length)
    if (selected && text.includes('{}')) {
      ins = text.replace('{}', `{${selected}}`)
      pos = start + ins.length
    }
    const next = latex.slice(0, start) + ins + latex.slice(end)
    setLatex(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  const close = () => useUi.getState().closeDialog()

  const submit = () => {
    if (!latex.trim() || preview.error) return
    const s = useDoc.getState()
    if (existing) {
      const updated = makeMathObject(latex, color, size, existing.x, existing.y, existing.id)
      s.commit(
        'Edit equation',
        onPage(s.pageId, (p) => {
          const i = p.objects.findIndex((o) => o.id === existing.id)
          if (i >= 0) p.objects[i] = updated
        }),
        { select: [existing.id] }
      )
    } else {
      const probe = makeMathObject(latex, color, size, 0, 0)
      const pos = at ? { x: at.x, y: at.y - probe.h / 2 } : centeredRect(probe.w, probe.h)
      addObjects([{ ...probe, x: pos.x, y: pos.y }], 'Add equation')
      useSettings.getState().updateDrawing('math', { color, fontSize: size })
      useUi.getState().setTool('select')
    }
    close()
  }

  const g = MATH_SYMBOL_GROUPS[group]
  return (
    <Dialog
      title={existing ? 'Edit Equation' : 'Insert Equation'}
      onClose={close}
      width={720}
      className="math-dialog"
      footer={
        <>
          <select
            className="select"
            value=""
            aria-label="Insert a common formula"
            onChange={(e) => {
              const t = MATH_TEMPLATES[Number(e.target.value)]
              if (t) setLatex(t.latex)
            }}
          >
            <option value="">Common formulas…</option>
            {MATH_TEMPLATES.map((t, i) => (
              <option key={t.label} value={i}>
                {t.label}
              </option>
            ))}
          </select>
          <span className="spacer" />
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!latex.trim() || !!preview.error}>
            {existing ? 'Update' : 'Insert'}
          </Button>
        </>
      }
    >
      <div className="math-palette">
        <div className="chip-row" role="tablist">
          {MATH_SYMBOL_GROUPS.map((x, i) => (
            <button key={x.name} type="button" role="tab" aria-selected={i === group} className={cx('chip', i === group && 'is-active')} onClick={() => setGroup(i)}>
              {x.name}
            </button>
          ))}
        </div>
        <div className="math-palette__keys">
          {g.items.map((it) => (
            <button key={it.title + it.label} type="button" className="math-key" onClick={() => insert(it.insert, it.caret)} data-tip={it.title} aria-label={it.title}>
              {it.label}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span className="field__label">Expression (LaTeX) — one line per row; use &amp; to align rows</span>
        <textarea
          ref={ref}
          className="input math-input"
          value={latex}
          rows={4}
          spellCheck={false}
          placeholder={'e.g.  x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}'}
          onChange={(e) => setLatex(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              submit()
            }
          }}
          data-autofocus
        />
      </label>
      <div className={cx('math-preview', preview.error && 'has-error')} aria-live="polite">
        {preview.url && <img src={preview.url} alt="Equation preview" />}
        {preview.error && <span className="math-preview__error">⚠ {preview.error}</span>}
        {!latex.trim() && <span className="math-preview__empty">Preview appears here</span>}
      </div>
      <div className="row row--wrap">
        <ColorRow colors={palette} value={color} onChange={(c) => c && setColor(c)} />
        <label className="inline-field">
          Size
          <input className="num-input" type="number" min={12} max={300} value={size} onChange={(e) => setSize(Math.max(12, Math.min(300, Number(e.target.value) || 12)))} />
        </label>
      </div>
    </Dialog>
  )
}
