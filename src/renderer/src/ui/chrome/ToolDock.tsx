import { useRef, useState } from 'react'
import { Calculator, Clock, FileUp, Image, Library, Search, Shuffle, Sigma, Sun, Table, Triangle, Ruler, Blinds, ChevronUp } from 'lucide-react'
import { SHAPE_KINDS } from '../../core/model'
import { runCommand, setTool } from '../../state/commands'
import { useDoc } from '../../state/doc'
import { useSettings, type ToolbarItemId } from '../../state/settings'
import { useUi, type ToolId, type WidgetId } from '../../state/ui'
import { cx, IconButton, Popover, useCommandTip } from '../primitives'
import { SHAPE_LABELS, ShapeIcon, TOOL_ICONS } from './icons'

const TOOL_COMMANDS: Partial<Record<ToolbarItemId, string>> = {
  select: 'tool.select',
  pan: 'tool.pan',
  pen: 'tool.pen',
  highlighter: 'tool.highlighter',
  eraser: 'tool.eraser',
  shape: 'tool.shape',
  line: 'tool.line',
  polygon: 'tool.polygon',
  text: 'tool.text',
  math: 'tool.math',
  laser: 'tool.laser',
  undo: 'edit.undo',
  redo: 'edit.redo',
  resources: 'view.resources'
}

const TEACHING_ITEMS: { id: WidgetId | 'resources'; label: string; icon: React.ReactNode }[] = [
  { id: 'timer', label: 'Timer & stopwatch', icon: <Clock size={18} /> },
  { id: 'calculator', label: 'Calculator', icon: <Calculator size={18} /> },
  { id: 'picker', label: 'Random picker', icon: <Shuffle size={18} /> },
  { id: 'ruler', label: 'Ruler', icon: <Ruler size={18} /> },
  { id: 'protractor', label: 'Protractor', icon: <Triangle size={18} /> },
  { id: 'magnifier', label: 'Magnifier', icon: <Search size={18} /> },
  { id: 'spotlight', label: 'Spotlight', icon: <Sun size={18} /> },
  { id: 'shade', label: 'Screen shade', icon: <Blinds size={18} /> },
  { id: 'resources', label: 'Resource library', icon: <Library size={18} /> }
]

function ToolButton({ item, onMore }: { item: ToolbarItemId; onMore?: (el: HTMLElement) => void }) {
  const tool = useUi((s) => s.tool)
  const shapeKind = useSettings((s) => s.settings.drawing.shape.kind)
  const canUndo = useDoc((s) => s.history.past.length > 0)
  const canRedo = useDoc((s) => s.history.future.length > 0)
  const drawer = useUi((s) => s.drawer)
  const cmd = TOOL_COMMANDS[item]
  const labels: Partial<Record<ToolbarItemId, string>> = { insert: 'Insert', teaching: 'Teaching tools', resources: 'Resource library' }
  const tip = useCommandTip(cmd ?? item, labels[item])
  const Icon = TOOL_ICONS[item]
  const isTool = cmd?.startsWith('tool.')
  const active = isTool ? tool === (item as ToolId) : item === 'resources' ? drawer === 'resources' : undefined
  const hasMenu = item === 'shape' || item === 'insert' || item === 'teaching'
  const disabled = (item === 'undo' && !canUndo) || (item === 'redo' && !canRedo)
  const dockLeft = useSettings((s) => s.settings.toolbar.position === 'left')
  return (
    <IconButton
      label={tip}
      size="l"
      active={active}
      disabled={disabled}
      tipSide={dockLeft ? 'right' : 'top'}
      className={cx('dock__btn', hasMenu && 'has-menu')}
      data-tool={item}
      onClick={(e) => {
        const el = e.currentTarget as HTMLElement
        if (item === 'shape') {
          if (tool === 'shape') onMore?.(el)
          else setTool('shape')
        } else if (hasMenu) onMore?.(el)
        else if (cmd) runCommand(cmd)
      }}
      onContextMenu={(e) => {
        if (hasMenu) {
          e.preventDefault()
          onMore?.(e.currentTarget as HTMLElement)
        }
      }}
    >
      {item === 'shape' ? <ShapeIcon kind={shapeKind} size={22} /> : Icon ? <Icon size={21} strokeWidth={1.9} /> : null}
      {hasMenu && <ChevronUp size={10} className="dock__chevron" aria-hidden="true" />}
    </IconButton>
  )
}

export function ToolDock() {
  const items = useSettings((s) => s.settings.toolbar.items)
  const dockLeft = useSettings((s) => s.settings.toolbar.position === 'left')
  const [menu, setMenu] = useState<{ kind: 'shape' | 'insert' | 'teaching'; el: HTMLElement } | null>(null)
  const shapeKind = useSettings((s) => s.settings.drawing.shape.kind)
  const widgets = useUi((s) => s.widgets)
  const ref = useRef<HTMLDivElement>(null)
  const close = () => setMenu(null)

  const groups: ToolbarItemId[][] = [[]]
  for (const it of items) {
    // Separate history buttons from tools visually.
    if ((it === 'undo' || it === 'redo') && groups[groups.length - 1].some((x) => x !== 'undo' && x !== 'redo')) groups.push([])
    groups[groups.length - 1].push(it)
  }

  return (
    <>
      <nav ref={ref} className={cx('dock', dockLeft && 'dock--left')} aria-label="Tools">
        {groups.map((g, gi) => (
          <div key={gi} className="dock__group">
            {g.map((it) => (
              <ToolButton key={it} item={it} onMore={(el) => setMenu({ kind: it as 'shape' | 'insert' | 'teaching', el })} />
            ))}
          </div>
        ))}
      </nav>

      <Popover anchor={menu?.el ?? null} open={menu?.kind === 'shape'} onClose={close} placement={dockLeft ? 'right' : 'top'} className="flyout">
        <div className="flyout__title">Shapes</div>
        <div className="shape-grid">
          {SHAPE_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={cx('shape-grid__item', k === shapeKind && 'is-active')}
              aria-label={SHAPE_LABELS[k]}
              data-tip={SHAPE_LABELS[k]}
              onClick={() => {
                useSettings.getState().updateDrawing('shape', { kind: k })
                setTool('shape')
                close()
              }}
            >
              <ShapeIcon kind={k} size={24} />
            </button>
          ))}
        </div>
        <div className="flyout__hint">Drag to draw · Shift keeps proportions · Alt draws from the centre</div>
      </Popover>

      <Popover anchor={menu?.el ?? null} open={menu?.kind === 'insert'} onClose={close} placement={dockLeft ? 'right' : 'top'} className="flyout">
        <div className="flyout__title">Insert</div>
        <div className="flyout__list">
          {[
            { label: 'Image from file…', icon: <Image size={18} />, cmd: 'insert.image' },
            { label: 'Table…', icon: <Table size={18} />, cmd: 'insert.table' },
            { label: 'Math equation…', icon: <Sigma size={18} />, cmd: 'insert.math' },
            { label: 'PDF as pages…', icon: <FileUp size={18} />, cmd: 'file.importPdf' }
          ].map((x) => (
            <button
              key={x.cmd}
              type="button"
              className="flyout__item"
              onClick={() => {
                close()
                runCommand(x.cmd)
              }}
            >
              {x.icon}
              <span>{x.label}</span>
            </button>
          ))}
        </div>
      </Popover>

      <Popover anchor={menu?.el ?? null} open={menu?.kind === 'teaching'} onClose={close} placement={dockLeft ? 'right' : 'top'} className="flyout">
        <div className="flyout__title">Teaching tools</div>
        <div className="flyout__grid">
          {TEACHING_ITEMS.map((x) => (
            <button
              key={x.id}
              type="button"
              className={cx('flyout__tile', x.id !== 'resources' && widgets.includes(x.id) && 'is-active')}
              onClick={() => {
                close()
                if (x.id === 'resources') runCommand('view.resources')
                else useUi.getState().toggleWidget(x.id)
              }}
            >
              {x.icon}
              <span>{x.label}</span>
            </button>
          ))}
        </div>
      </Popover>
    </>
  )
}
