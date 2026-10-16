import { AlignCenter, AlignLeft, AlignRight, ArrowDownToLine, ArrowUpToLine, Bold, CopyPlus, Italic, Trash2, Underline, Sigma, Pen, PenLine, SplineIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { BoardObject, DashStyle, LineCap, PenStyle, TextObject } from '../../core/model'
import { FONT_OPTIONS } from '../../core/text'
import { runCommand } from '../../state/commands'
import { currentPage, useDoc } from '../../state/doc'
import { reorderSelection, updateObjects } from '../../state/ops'
import { useSettings } from '../../state/settings'
import { useUi } from '../../state/ui'
import { updateTextDraft } from '../../tools/textTools'
import { ColorButton, ColorRow, cx, IconButton, Segmented } from '../primitives'
import { LineIcon } from './icons'

const WIDTHS_PEN = [2, 4, 7, 12, 20]
const WIDTHS_HL = [12, 22, 34]
const WIDTHS_SHAPE = [1, 2, 3, 5, 8]

function Group({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="pbar__group" role="group" aria-label={label}>
      {children}
    </div>
  )
}

function WidthPicker({ value, options, onChange, color }: { value: number; options: number[]; onChange: (v: number) => void; color: string }) {
  return (
    <div className="width-picker" role="radiogroup" aria-label="Thickness">
      {options.map((w) => (
        <button
          key={w}
          type="button"
          role="radio"
          aria-checked={Math.abs(w - value) < 0.01}
          className={cx('width-picker__item', Math.abs(w - value) < 0.01 && 'is-active')}
          onClick={() => onChange(w)}
          data-tip={`${w} px`}
          aria-label={`${w} pixels`}
        >
          <span style={{ width: Math.min(22, Math.max(3, w * 0.9)), height: Math.min(22, Math.max(3, w * 0.9)), background: color }} />
        </button>
      ))}
      <input
        className="width-picker__num"
        type="number"
        min={0.5}
        max={80}
        step={0.5}
        value={value}
        aria-label="Custom thickness"
        onChange={(e) => {
          const v = Number(e.target.value)
          if (v > 0 && v <= 80) onChange(v)
        }}
      />
    </div>
  )
}

function DashPicker({ value, onChange }: { value: DashStyle; onChange: (d: DashStyle) => void }) {
  return (
    <Segmented
      label="Line style"
      value={value}
      onChange={onChange}
      options={[
        { value: 'solid', label: <svg width="22" height="10"><line x1="1" y1="5" x2="21" y2="5" stroke="currentColor" strokeWidth="2" /></svg>, title: 'Solid' },
        { value: 'dashed', label: <svg width="22" height="10"><line x1="1" y1="5" x2="21" y2="5" stroke="currentColor" strokeWidth="2" strokeDasharray="5 3" /></svg>, title: 'Dashed' },
        { value: 'dotted', label: <svg width="22" height="10"><line x1="2" y1="5" x2="21" y2="5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="0.1 4.5" /></svg>, title: 'Dotted' }
      ]}
    />
  )
}

function CapPicker({ start, end, onChange }: { start: LineCap; end: LineCap; onChange: (s: LineCap, e: LineCap) => void }) {
  const presets: [LineCap, LineCap, string][] = [
    ['none', 'none', 'Line'],
    ['none', 'arrow', 'Arrow'],
    ['arrow', 'arrow', 'Double arrow'],
    ['dot', 'dot', 'Segment with end points'],
    ['dot', 'arrow', 'Ray']
  ]
  return (
    <div className="segmented" role="radiogroup" aria-label="Line ends">
      {presets.map(([s, e, label]) => (
        <button
          key={label}
          type="button"
          role="radio"
          aria-checked={s === start && e === end}
          className={cx('segmented__item', s === start && e === end && 'is-active')}
          onClick={() => onChange(s, e)}
          aria-label={label}
          data-tip={label}
        >
          <LineIcon start={s} end={e} dash="solid" />
        </button>
      ))}
    </div>
  )
}

function TextControls({ t, onChange }: { t: Pick<TextObject, 'fontFamily' | 'fontSize' | 'bold' | 'italic' | 'underline' | 'align' | 'color'>; onChange: (p: Partial<TextObject>) => void }) {
  const palette = useSettings((s) => s.settings.palette)
  return (
    <>
      <Group label="Font">
        <select className="select" value={t.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value })} aria-label="Font" data-keep-text-edit>
          {FONT_OPTIONS.map((f) => (
            <option key={f.family} value={f.family}>
              {f.label}
            </option>
          ))}
        </select>
        <input
          className="num-input"
          type="number"
          min={8}
          max={300}
          value={Math.round(t.fontSize)}
          aria-label="Font size"
          data-keep-text-edit
          onChange={(e) => {
            const v = Number(e.target.value)
            if (v >= 6 && v <= 400) onChange({ fontSize: v })
          }}
        />
      </Group>
      <Group label="Style">
        <IconButton label="Bold" size="s" active={t.bold} onMouseDown={(e) => e.preventDefault()} onClick={() => onChange({ bold: !t.bold })} data-keep-text-edit>
          <Bold size={16} />
        </IconButton>
        <IconButton label="Italic" size="s" active={t.italic} onMouseDown={(e) => e.preventDefault()} onClick={() => onChange({ italic: !t.italic })} data-keep-text-edit>
          <Italic size={16} />
        </IconButton>
        <IconButton label="Underline" size="s" active={t.underline} onMouseDown={(e) => e.preventDefault()} onClick={() => onChange({ underline: !t.underline })} data-keep-text-edit>
          <Underline size={16} />
        </IconButton>
        <IconButton label="Align left" size="s" active={t.align === 'left'} onMouseDown={(e) => e.preventDefault()} onClick={() => onChange({ align: 'left' })} data-keep-text-edit>
          <AlignLeft size={16} />
        </IconButton>
        <IconButton label="Align centre" size="s" active={t.align === 'center'} onMouseDown={(e) => e.preventDefault()} onClick={() => onChange({ align: 'center' })} data-keep-text-edit>
          <AlignCenter size={16} />
        </IconButton>
        <IconButton label="Align right" size="s" active={t.align === 'right'} onMouseDown={(e) => e.preventDefault()} onClick={() => onChange({ align: 'right' })} data-keep-text-edit>
          <AlignRight size={16} />
        </IconButton>
      </Group>
      <Group label="Colour">
        <div onMouseDown={(e) => e.preventDefault()} data-keep-text-edit>
          <ColorRow colors={palette} value={t.color} onChange={(c) => c && onChange({ color: c })} />
        </div>
      </Group>
    </>
  )
}

function strokeColorOf(o: BoardObject): string | null {
  switch (o.type) {
    case 'stroke':
      return o.color
    case 'shape':
    case 'line':
    case 'polygon':
    case 'table':
      return o.stroke
    case 'text':
    case 'math':
      return o.color
    default:
      return null
  }
}

/** Applies a colour to whatever "colour" means for each selected object. */
function withColor(o: BoardObject, c: string): BoardObject {
  switch (o.type) {
    case 'stroke':
      return { ...o, color: c }
    case 'shape':
    case 'line':
    case 'polygon':
    case 'table':
      return { ...o, stroke: c }
    case 'text':
    case 'math':
      return { ...o, color: c }
    default:
      return o
  }
}

function SelectionControls({ objs }: { objs: BoardObject[] }) {
  const palette = useSettings((s) => s.settings.palette)
  const ids = objs.map((o) => o.id)
  const first = objs[0]
  const allType = (t: BoardObject['type']) => objs.every((o) => o.type === t)
  const color = strokeColorOf(first)
  const fillable = objs.filter((o) => o.type === 'shape' || o.type === 'polygon' || o.type === 'table')
  const widthable = objs.filter((o) => o.type === 'stroke' || o.type === 'shape' || o.type === 'line' || o.type === 'polygon')
  const dashable = objs.filter((o) => o.type === 'shape' || o.type === 'line' || o.type === 'polygon')
  const width = widthable[0] ? (widthable[0].type === 'stroke' ? widthable[0].width : (widthable[0] as { strokeWidth: number }).strokeWidth) : 0
  return (
    <>
      {allType('text') ? (
        <TextControls t={first as TextObject} onChange={(p) => updateObjects(ids, 'Format text', (o) => (o.type === 'text' ? { ...o, ...p } : o))} />
      ) : (
        color !== null && (
          <Group label="Colour">
            {fillable.length || widthable.length ? (
              <ColorButton label="Colour" colors={palette} value={color} onChange={(c) => c && updateObjects(ids, 'Change colour', (o) => withColor(o, c))} />
            ) : (
              <ColorRow colors={palette} value={color} onChange={(c) => c && updateObjects(ids, 'Change colour', (o) => withColor(o, c))} />
            )}
          </Group>
        )
      )}
      {fillable.length > 0 && (
        <Group label="Fill">
          <ColorButton
            label="Fill"
            colors={palette}
            value={(fillable[0] as { fill: string | null }).fill}
            allowNone
            onChange={(c) => updateObjects(fillable.map((o) => o.id), 'Change fill', (o) => ('fill' in o ? ({ ...o, fill: c } as BoardObject) : o))}
          />
        </Group>
      )}
      {widthable.length > 0 && (
        <Group label="Thickness">
          <WidthPicker
            value={width}
            options={allType('stroke') ? WIDTHS_PEN : WIDTHS_SHAPE}
            color={color ?? '#555'}
            onChange={(w) =>
              updateObjects(widthable.map((o) => o.id), 'Change thickness', (o) =>
                o.type === 'stroke' ? { ...o, width: w } : o.type === 'shape' || o.type === 'line' || o.type === 'polygon' ? { ...o, strokeWidth: w } : o
              )
            }
          />
        </Group>
      )}
      {dashable.length > 0 && (
        <Group label="Line style">
          <DashPicker
            value={(dashable[0] as { dash: DashStyle }).dash}
            onChange={(d) => updateObjects(dashable.map((o) => o.id), 'Change line style', (o) => ('dash' in o ? ({ ...o, dash: d } as BoardObject) : o))}
          />
        </Group>
      )}
      {objs.length === 1 && first.type === 'line' && (
        <Group label="Line ends">
          <CapPicker start={first.startCap} end={first.endCap} onChange={(s, e) => updateObjects(ids, 'Change line ends', (o) => (o.type === 'line' ? { ...o, startCap: s, endCap: e } : o))} />
        </Group>
      )}
      {objs.length === 1 && first.type === 'math' && (
        <Group label="Equation">
          <button type="button" className="btn btn--secondary btn--small" onClick={() => useUi.getState().openDialog({ kind: 'math', editId: first.id })}>
            <Sigma size={14} /> Edit equation
          </button>
        </Group>
      )}
      {objs.length === 1 && first.type === 'image' && (
        <Group label="Opacity">
          <span className="pbar__label">Opacity</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={first.opacity}
            aria-label="Image opacity"
            onChange={(e) => {
              const v = Number(e.target.value)
              useDoc.getState().transient((d) => {
                for (const s of d.sections) for (const p of s.pages) for (const o of p.objects) if (o.id === first.id && o.type === 'image') o.opacity = v
              })
            }}
            onPointerDown={() => useDoc.getState().begin()}
            onPointerUp={() => useDoc.getState().end('Change opacity')}
          />
        </Group>
      )}
      <Group label="Arrange">
        <IconButton label="Bring to front" size="s" onClick={() => reorderSelection('front')}>
          <ArrowUpToLine size={16} />
        </IconButton>
        <IconButton label="Send to back" size="s" onClick={() => reorderSelection('back')}>
          <ArrowDownToLine size={16} />
        </IconButton>
        <IconButton label="Duplicate" size="s" onClick={() => runCommand('edit.duplicate')}>
          <CopyPlus size={16} />
        </IconButton>
        <IconButton label="Delete" size="s" className="is-danger" onClick={() => runCommand('edit.delete')}>
          <Trash2 size={16} />
        </IconButton>
      </Group>
      <span className="pbar__count">{objs.length === 1 ? typeLabel(first) : `${objs.length} objects`}</span>
    </>
  )
}

function typeLabel(o: BoardObject): string {
  const map: Record<BoardObject['type'], string> = {
    stroke: o.type === 'stroke' && o.tool === 'highlighter' ? 'Highlight' : 'Ink',
    shape: 'Shape',
    line: 'Line',
    polygon: 'Polygon',
    text: 'Text',
    math: 'Equation',
    image: 'Image',
    table: 'Table'
  }
  return map[o.type]
}

export function PropertyBar() {
  const tool = useUi((s) => s.tool)
  const textEdit = useUi((s) => s.textEdit)
  const drawing = useSettings((s) => s.settings.drawing)
  const palette = useSettings((s) => s.settings.palette)
  const hlPalette = useSettings((s) => s.settings.highlighterPalette)
  const update = useSettings((s) => s.updateDrawing)
  const selection = useDoc((s) => s.selection)
  const page = useDoc((s) => currentPage(s))
  const dockLeft = useSettings((s) => s.settings.toolbar.position === 'left')

  let content: ReactNode = null
  if (textEdit) {
    content = (
      <TextControls
        t={textEdit.draft}
        onChange={(p) => {
          updateTextDraft(p)
          // New text inherits the latest choices.
          useSettings.getState().updateDrawing('text', p as never)
          requestAnimationFrame(() => (document.querySelector('.text-editor') as HTMLTextAreaElement | null)?.focus())
        }}
      />
    )
  } else if (tool === 'select' && selection.length) {
    const ids = new Set(selection)
    const objs = page.objects.filter((o) => ids.has(o.id))
    if (objs.length) content = <SelectionControls objs={objs} />
  } else if (tool === 'pen') {
    content = (
      <>
        <Group label="Pen type">
          <Segmented<PenStyle>
            label="Pen type"
            value={drawing.pen.style}
            onChange={(v) => update('pen', { style: v })}
            options={[
              { value: 'pen', label: <Pen size={16} />, title: 'Pen (pressure-sensitive with a stylus)' },
              { value: 'marker', label: <PenLine size={16} />, title: 'Marker (even width)' },
              { value: 'dashed', label: <SplineIcon size={16} />, title: 'Dashed pen' }
            ]}
          />
        </Group>
        <Group label="Colour">
          <ColorRow colors={palette} value={drawing.pen.color} onChange={(c) => c && update('pen', { color: c })} />
        </Group>
        <Group label="Thickness">
          <WidthPicker value={drawing.pen.width} options={WIDTHS_PEN} color={drawing.pen.color} onChange={(w) => update('pen', { width: w })} />
        </Group>
      </>
    )
  } else if (tool === 'highlighter') {
    content = (
      <>
        <Group label="Colour">
          <ColorRow colors={hlPalette} value={drawing.highlighter.color} onChange={(c) => c && update('highlighter', { color: c })} />
        </Group>
        <Group label="Thickness">
          <WidthPicker value={drawing.highlighter.width} options={WIDTHS_HL} color={drawing.highlighter.color} onChange={(w) => update('highlighter', { width: w })} />
        </Group>
      </>
    )
  } else if (tool === 'eraser') {
    content = (
      <>
        <Group label="Eraser mode">
          <Segmented
            label="Eraser mode"
            value={drawing.eraser.mode}
            onChange={(v) => update('eraser', { mode: v })}
            options={[
              { value: 'partial', label: 'Partial', title: 'Erase parts of ink strokes' },
              { value: 'object', label: 'Whole object', title: 'Erase whole strokes, shapes and lines' }
            ]}
          />
        </Group>
        <Group label="Size">
          <span className="pbar__label">Size</span>
          <input type="range" min={6} max={160} value={drawing.eraser.size} onChange={(e) => update('eraser', { size: Number(e.target.value) })} aria-label="Eraser size" />
          <span className="pbar__value">{drawing.eraser.size}</span>
        </Group>
        <Group label="Page">
          <button type="button" className="btn btn--ghost btn--small" onClick={() => runCommand('page.clear')} disabled={!page.objects.length}>
            Clear page
          </button>
        </Group>
      </>
    )
  } else if (tool === 'shape' || tool === 'polygon') {
    content = (
      <>
        <Group label="Outline">
          <ColorButton label="Outline" colors={palette} value={drawing.shape.stroke} onChange={(c) => c && update('shape', { stroke: c })} />
        </Group>
        <Group label="Fill">
          <ColorButton label="Fill" colors={palette} value={drawing.shape.fill} allowNone onChange={(c) => update('shape', { fill: c })} />
        </Group>
        <Group label="Thickness">
          <WidthPicker value={drawing.shape.strokeWidth} options={WIDTHS_SHAPE} color={drawing.shape.stroke} onChange={(w) => update('shape', { strokeWidth: w })} />
        </Group>
        <Group label="Line style">
          <DashPicker value={drawing.shape.dash} onChange={(d) => update('shape', { dash: d })} />
        </Group>
      </>
    )
  } else if (tool === 'line') {
    content = (
      <>
        <Group label="Line ends">
          <CapPicker start={drawing.line.startCap} end={drawing.line.endCap} onChange={(s, e) => update('line', { startCap: s, endCap: e })} />
        </Group>
        <Group label="Colour">
          <ColorButton label="Colour" colors={palette} value={drawing.line.stroke} onChange={(c) => c && update('line', { stroke: c })} />
        </Group>
        <Group label="Thickness">
          <WidthPicker value={drawing.line.strokeWidth} options={WIDTHS_SHAPE} color={drawing.line.stroke} onChange={(w) => update('line', { strokeWidth: w })} />
        </Group>
        <Group label="Line style">
          <DashPicker value={drawing.line.dash} onChange={(d) => update('line', { dash: d })} />
        </Group>
      </>
    )
  } else if (tool === 'text') {
    content = <TextControls t={drawing.text} onChange={(p) => update('text', p as never)} />
  } else if (tool === 'math') {
    content = (
      <>
        <Group label="Colour">
          <ColorRow colors={palette} value={drawing.math.color} onChange={(c) => c && update('math', { color: c })} />
        </Group>
        <Group label="Size">
          <span className="pbar__label">Size</span>
          <input className="num-input" type="number" min={12} max={300} value={drawing.math.fontSize} aria-label="Equation size" onChange={(e) => Number(e.target.value) >= 12 && update('math', { fontSize: Number(e.target.value) })} />
        </Group>
        <span className="pbar__hint">Click the page to place an equation</span>
      </>
    )
  } else if (tool === 'laser') {
    content = <span className="pbar__hint">Laser pointer — point at things without drawing on the page</span>
  } else if (tool === 'pan') {
    content = <span className="pbar__hint">Drag to move around the page · hold Space with any tool to pan</span>
  }

  if (!content) return null
  return (
    <div className={cx('pbar', dockLeft && 'pbar--top')} role="toolbar" aria-label="Tool options" data-keep-text-edit>
      {content}
    </div>
  )
}
