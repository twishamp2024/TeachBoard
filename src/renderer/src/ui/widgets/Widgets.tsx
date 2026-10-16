import { useEffect, useRef, useState } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import { useUi } from '../../state/ui'
import { pointerChannel, renderChannel } from '../canvas/bus'
import { CalculatorWidget } from './CalculatorWidget'
import { FloatingPanel } from './FloatingPanel'
import { PickerWidget } from './PickerWidget'
import { TimerWidget } from './TimerWidget'

/** A movable lens that magnifies the board beneath it. */
function Magnifier() {
  const ref = useRef<HTMLCanvasElement>(null)
  const [pos, setPos] = useState({ x: 260, y: 160 })
  const [factor, setFactor] = useState(2.5)
  const size = 240

  useEffect(() => {
    const draw = () => {
      const lens = ref.current
      const base = renderChannel.last
      if (!lens || !base) return
      const dpr = window.devicePixelRatio || 1
      lens.width = size * dpr
      lens.height = size * dpr
      const ctx = lens.getContext('2d')!
      const cx = (pos.x + size / 2) * dpr
      const cy = (pos.y + size / 2) * dpr
      const src = (size * dpr) / factor
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--c-workspace')
      ctx.fillRect(0, 0, lens.width, lens.height)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(base, cx - src / 2, cy - src / 2, src, src, 0, 0, lens.width, lens.height)
    }
    draw()
    return renderChannel.on(draw)
  }, [pos, factor])

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const sx = e.clientX
    const sy = e.clientY
    const start = pos
    const move = (ev: PointerEvent) => setPos({ x: start.x + ev.clientX - sx, y: start.y + ev.clientY - sy })
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      className="magnifier no-canvas-wheel"
      style={{ left: pos.x, top: pos.y, width: size, height: size }}
      onPointerDown={onDown}
      onWheel={(e) => setFactor((f) => Math.max(1.5, Math.min(6, f * (e.deltaY < 0 ? 1.1 : 0.9))))}
      role="img"
      aria-label={`Magnifier ${factor.toFixed(1)}×. Drag to move.`}
    >
      <canvas ref={ref} style={{ width: size, height: size }} />
      <div className="magnifier__controls">
        <button type="button" aria-label="Zoom out" onClick={() => setFactor((f) => Math.max(1.5, f - 0.5))}>
          <Minus size={13} />
        </button>
        <span>{factor.toFixed(1)}×</span>
        <button type="button" aria-label="Zoom in" onClick={() => setFactor((f) => Math.min(6, f + 0.5))}>
          <Plus size={13} />
        </button>
        <button type="button" aria-label="Close magnifier" onClick={() => useUi.getState().closeWidget('magnifier')}>
          <X size={13} />
        </button>
      </div>
    </div>
  )
}

/** Dims the board except around the pointer. Drawing still works underneath. */
function Spotlight() {
  const [p, setP] = useState(pointerChannel.last ?? { x: 400, y: 300, inside: true })
  const [radius, setRadius] = useState(150)
  useEffect(() => pointerChannel.on((v) => v.inside && setP(v)), [])
  return (
    <>
      <div
        className="spotlight"
        aria-hidden="true"
        style={{ background: `radial-gradient(circle ${radius}px at ${p.x}px ${p.y}px, transparent 0, transparent ${radius - 2}px, rgba(8,10,14,0.82) ${radius}px)` }}
      />
      <div className="overlay-chip no-canvas-wheel">
        <span>Spotlight</span>
        <input type="range" min={60} max={400} value={radius} onChange={(e) => setRadius(Number(e.target.value))} aria-label="Spotlight size" />
        <button type="button" aria-label="Close spotlight" onClick={() => useUi.getState().closeWidget('spotlight')}>
          <X size={14} />
        </button>
      </div>
    </>
  )
}

/** A curtain that hides part of the board; drag its edge to reveal content step by step. */
function Shade() {
  const host = useRef<HTMLDivElement>(null)
  const [frac, setFrac] = useState(0.6)
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault()
    const stage = host.current?.parentElement?.getBoundingClientRect()
    if (!stage) return
    const move = (ev: PointerEvent) => setFrac(Math.max(0, Math.min(1, (ev.clientY - stage.top) / stage.height)))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return (
    <div ref={host} className="shade" style={{ height: `${frac * 100}%` }}>
      <div className="shade__label">Drag the handle to reveal</div>
      <div className="shade__handle" onPointerDown={onDown} onDoubleClick={() => setFrac(frac > 0.05 ? 0 : 0.6)} role="slider" aria-label="Screen shade" aria-valuenow={Math.round(frac * 100)} aria-valuemin={0} aria-valuemax={100} tabIndex={0} onKeyDown={(e) => {
        if (e.key === 'ArrowUp') setFrac((f) => Math.max(0, f - 0.05))
        if (e.key === 'ArrowDown') setFrac((f) => Math.min(1, f + 0.05))
      }}>
        <span />
      </div>
      <button type="button" className="shade__close" aria-label="Close screen shade" onClick={() => useUi.getState().closeWidget('shade')}>
        <X size={14} />
      </button>
    </div>
  )
}

export function Widgets() {
  const widgets = useUi((s) => s.widgets)
  const close = useUi((s) => s.closeWidget)
  return (
    <>
      {widgets.includes('shade') && <Shade />}
      {widgets.includes('spotlight') && <Spotlight />}
      {widgets.includes('magnifier') && <Magnifier />}
      {widgets.includes('timer') && (
        <FloatingPanel id="timer" title="Timer" width={260} initial={{ x: 24, y: 24 }} onClose={() => close('timer')}>
          <TimerWidget />
        </FloatingPanel>
      )}
      {widgets.includes('calculator') && (
        <FloatingPanel id="calculator" title="Calculator" width={290} initial={{ x: 300, y: 24 }} onClose={() => close('calculator')}>
          <CalculatorWidget />
        </FloatingPanel>
      )}
      {widgets.includes('picker') && (
        <FloatingPanel id="picker" title="Random Picker" width={260} initial={{ x: 610, y: 24 }} onClose={() => close('picker')}>
          <PickerWidget />
        </FloatingPanel>
      )}
    </>
  )
}
