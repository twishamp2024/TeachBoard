import { useEffect, useRef } from 'react'
import { Pin, PinOff, X } from 'lucide-react'
import { useUi } from '../../state/ui'
import { cx, IconButton } from '../primitives'
import { BackgroundPanel } from './BackgroundPanel'
import { ResourcesPanel } from './ResourcesPanel'

const TITLES = { background: 'Page Background', resources: 'Resource Library' } as const

/** A dockable side panel over the right edge of the stage. Resizable and pinnable. */
export function Drawer() {
  const drawer = useUi((s) => s.drawer)
  const pinned = useUi((s) => s.drawerPinned)
  const width = useUi((s) => s.drawerWidth)
  const tool = useUi((s) => s.tool)
  const ref = useRef<HTMLDivElement>(null)
  const prevTool = useRef(tool)

  // An unpinned drawer gets out of the way when the user picks a drawing tool.
  useEffect(() => {
    if (prevTool.current !== tool && drawer && !pinned && tool !== 'select') useUi.getState().setDrawer(null)
    prevTool.current = tool
  }, [tool, drawer, pinned])

  if (!drawer) return null
  const onResize = (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const move = (ev: PointerEvent) => {
      const w = Math.max(260, Math.min(560, startW + (startX - ev.clientX)))
      useUi.getState().set({ drawerWidth: w })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return (
    <aside ref={ref} className={cx('drawer', pinned && 'is-pinned')} style={{ width }} aria-label={TITLES[drawer]}>
      <div className="drawer__resize" onPointerDown={onResize} role="separator" aria-orientation="vertical" aria-label="Resize panel" />
      <header className="drawer__head">
        <h2>{TITLES[drawer]}</h2>
        <IconButton label={pinned ? 'Unpin panel' : 'Pin panel open'} size="s" active={pinned} onClick={() => useUi.getState().set({ drawerPinned: !pinned })}>
          {pinned ? <PinOff size={15} /> : <Pin size={15} />}
        </IconButton>
        <IconButton label="Close panel" size="s" onClick={() => useUi.getState().setDrawer(null)}>
          <X size={16} />
        </IconButton>
      </header>
      <div className="drawer__body no-canvas-wheel">
        {drawer === 'background' && <BackgroundPanel />}
        {drawer === 'resources' && <ResourcesPanel />}
      </div>
    </aside>
  )
}
