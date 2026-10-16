import { useRef, type PointerEvent as RPointerEvent, type ReactElement } from 'react'
import { RotateCw, X } from 'lucide-react'
import type { Viewport } from '../../core/viewport'
import { useUi, type InstrumentState } from '../../state/ui'

/** Page pixels per centimetre (96 px per inch, so exports measure true size). */
export const PX_PER_CM = 96 / 2.54

/** Centre of the ruler rotation knob: distance from the right end, and from the top edge. */
const RULER_KNOB = { fromEnd: 22, y: 70 }

type Which = 'ruler' | 'protractor'

function useInstrumentDrag(which: Which, viewport: Viewport) {
  const drag = useRef<{ mode: 'move' | 'rotate'; sx: number; sy: number; start: InstrumentState; originScreen: { x: number; y: number } } | null>(null)

  const onDown = (mode: 'move' | 'rotate') => (e: RPointerEvent<HTMLElement>) => {
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const st = useUi.getState()[which]
    const host = (e.currentTarget as HTMLElement).closest('.canvas-host')!.getBoundingClientRect()
    drag.current = {
      mode,
      sx: e.clientX,
      sy: e.clientY,
      start: st,
      originScreen: { x: host.left + st.x * viewport.zoom + viewport.panX, y: host.top + st.y * viewport.zoom + viewport.panY }
    }
  }
  const onMove = (e: RPointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d) return
    if (d.mode === 'move') {
      const dx = (e.clientX - d.sx) / viewport.zoom
      const dy = (e.clientY - d.sy) / viewport.zoom
      useUi.getState().set({ [which]: { ...d.start, x: d.start.x + dx, y: d.start.y + dy } })
    } else {
      let a = Math.atan2(e.clientY - d.originScreen.y, e.clientX - d.originScreen.x)
      // The ruler's knob sits below its edge; subtract the knob's own angle in ruler space.
      if (which === 'ruler') a -= Math.atan2(RULER_KNOB.y, d.start.length - RULER_KNOB.fromEnd)
      // Shift snaps to 15°; otherwise snap gently near whole multiples of 5°.
      const step = e.shiftKey ? Math.PI / 12 : Math.PI / 36
      const snapped = Math.round(a / step) * step
      if (e.shiftKey || Math.abs(snapped - a) < 0.012) a = snapped
      useUi.getState().set({ [which]: { ...d.start, angle: a } })
    }
  }
  const onUp = () => {
    drag.current = null
  }
  return { onDown, onMove, onUp }
}

function degrees(rad: number): number {
  let d = Math.round((rad * 180) / Math.PI) % 360
  if (d < 0) d += 360
  return d
}

function Ruler({ viewport }: { viewport: Viewport }) {
  const r = useUi((s) => s.ruler)
  const { onDown, onMove, onUp } = useInstrumentDrag('ruler', viewport)
  const height = 86
  const cm = Math.floor(r.length / PX_PER_CM)
  const ticks: ReactElement[] = []
  for (let mm = 0; mm <= cm * 10; mm++) {
    const x = 18 + (mm * PX_PER_CM) / 10
    if (x > r.length - 6) break
    const len = mm % 10 === 0 ? 26 : mm % 5 === 0 ? 17 : 10
    ticks.push(<line key={mm} x1={x} x2={x} y1={0} y2={len} />)
    if (mm % 10 === 0) {
      ticks.push(
        <text key={`t${mm}`} x={x} y={42} textAnchor="middle">
          {mm / 10}
        </text>
      )
    }
  }
  return (
    <div
      className="instrument ruler"
      style={{
        width: r.length,
        height,
        transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom}) translate(${r.x}px, ${r.y}px) rotate(${r.angle}rad)`
      }}
      onPointerDown={onDown('move')}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      role="group"
      aria-label="Ruler. Drag to move; draw along its top edge for straight lines."
    >
      <svg width={r.length} height={height} className="ruler__scale" aria-hidden="true">
        {ticks}
        <text x={r.length - 120} y={70} className="ruler__unit">
          cm · {degrees(r.angle)}°
        </text>
      </svg>
      <button type="button" className="instrument__knob" style={{ left: r.length - 40, top: 52 }} onPointerDown={onDown('rotate')} onPointerMove={onMove} onPointerUp={onUp} aria-label="Rotate ruler" data-tip="Drag to rotate (Shift snaps to 15°)">
        <RotateCw size={16} />
      </button>
      <button type="button" className="instrument__close" style={{ left: 6, top: 52 }} onPointerDown={(e) => e.stopPropagation()} onClick={() => useUi.getState().closeWidget('ruler')} aria-label="Close ruler">
        <X size={14} />
      </button>
    </div>
  )
}

function Protractor({ viewport }: { viewport: Viewport }) {
  const p = useUi((s) => s.protractor)
  const { onDown, onMove, onUp } = useInstrumentDrag('protractor', viewport)
  const R = p.length / 2
  const size = R * 2
  const elems: ReactElement[] = []
  for (let deg = 0; deg <= 180; deg++) {
    const a = Math.PI - (deg * Math.PI) / 180
    const len = deg % 10 === 0 ? 22 : deg % 5 === 0 ? 14 : 8
    const x1 = R + Math.cos(a) * R
    const y1 = R - Math.sin(a) * R
    const x2 = R + Math.cos(a) * (R - len)
    const y2 = R - Math.sin(a) * (R - len)
    elems.push(<line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} />)
    if (deg % 10 === 0) {
      const lx = R + Math.cos(a) * (R - 36)
      const ly = R - Math.sin(a) * (R - 36)
      const ix = R + Math.cos(a) * (R - 58)
      const iy = R - Math.sin(a) * (R - 58)
      elems.push(
        <text key={`o${deg}`} x={lx} y={ly + 5} textAnchor="middle">
          {deg}
        </text>,
        <text key={`i${deg}`} x={ix} y={iy + 4} textAnchor="middle" className="protractor__inner">
          {180 - deg}
        </text>
      )
    }
  }
  return (
    // Outer element maps page → screen; the inner one rotates about the protractor's centre.
    <div className="instrument-anchor" style={{ transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom}) translate(${p.x}px, ${p.y}px)` }}>
    <div
      className="instrument protractor"
      style={{ left: -R, top: -R, width: size, height: R + 24, transformOrigin: `${R}px ${R}px`, transform: `rotate(${p.angle}rad)` }}
      onPointerDown={onDown('move')}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      role="group"
      aria-label="Protractor. Drag to move."
    >
      <svg width={size} height={R + 24} aria-hidden="true">
        <path d={`M 0 ${R} A ${R} ${R} 0 0 1 ${size} ${R} Z`} className="protractor__body" />
        <path d={`M ${R * 0.42} ${R} A ${R * 0.58} ${R * 0.58} 0 0 1 ${size - R * 0.42} ${R}`} className="protractor__arc" />
        {elems}
        <line x1={R} y1={R} x2={R} y2={R - 30} className="protractor__center" />
        <circle cx={R} cy={R} r={4} className="protractor__dot" />
        <text x={R} y={R + 18} textAnchor="middle" className="protractor__angle">
          {degrees(p.angle)}°
        </text>
      </svg>
      <button type="button" className="instrument__knob" style={{ left: size - 18, top: R - 18 }} onPointerDown={onDown('rotate')} onPointerMove={onMove} onPointerUp={onUp} aria-label="Rotate protractor" data-tip="Drag to rotate">
        <RotateCw size={16} />
      </button>
      <button type="button" className="instrument__close" style={{ left: -12, top: R - 14 }} onPointerDown={(e) => e.stopPropagation()} onClick={() => useUi.getState().closeWidget('protractor')} aria-label="Close protractor">
        <X size={14} />
      </button>
    </div>
    </div>
  )
}

export function Instruments({ viewport }: { viewport: Viewport }) {
  const widgets = useUi((s) => s.widgets)
  return (
    <>
      {widgets.includes('ruler') && <Ruler viewport={viewport} />}
      {widgets.includes('protractor') && <Protractor viewport={viewport} />}
    </>
  )
}
