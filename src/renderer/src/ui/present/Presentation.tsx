import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Eraser, Pencil, Pointer, X } from 'lucide-react'
import { allPages } from '../../core/document'
import type { StrokeObject } from '../../core/model'
import { renderPage } from '../../core/render'
import { resources } from '../../core/resources'
import { drawStroke } from '../../core/strokes'
import { fitPage } from '../../core/viewport'
import { api } from '../../platform'
import { useDoc } from '../../state/doc'
import { useUi } from '../../state/ui'
import { cx } from '../primitives'

type PresentTool = 'click' | 'laser' | 'pen'

/**
 * Full-screen presentation. It only reads the lesson: navigation, the laser
 * pointer and temporary ink never modify the document.
 */
export function Presentation() {
  const doc = useDoc((s) => s.doc)
  const pages = useMemo(() => allPages(doc), [doc])
  const startId = useUi((s) => s.presenting?.startPageId)
  const [index, setIndex] = useState(() => Math.max(0, pages.findIndex((p) => p.id === startId)))
  const [tool, setTool] = useState<PresentTool>('click')
  const [ink, setInk] = useState<Record<string, StrokeObject[]>>({})
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [chrome, setChrome] = useState(true)
  const [resVersion, setResVersion] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef<StrokeObject | null>(null)
  const laser = useRef<{ x: number; y: number; t: number }[]>([])
  const entered = useRef(false)
  const page = pages[Math.min(index, pages.length - 1)]
  const view = fitPage(size.w, size.h, page.width, page.height, 0)

  const exit = useCallback(() => {
    useUi.getState().set({ presenting: null })
  }, [])

  // Enter full screen; leaving full screen by any route ends the presentation.
  useEffect(() => {
    let alive = true
    void api.setFullScreen(true).then(() => {
      entered.current = true
    })
    const off = api.onFullScreenChanged((on) => {
      if (!on && entered.current && alive) exit()
    })
    return () => {
      alive = false
      off()
      void api.setFullScreen(false)
      useUi.getState().set({ fullScreen: false })
    }
  }, [exit])

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => resources.subscribe(() => setResVersion((v) => v + 1)), [])

  // Auto-hide the control bar after a few seconds without movement.
  useEffect(() => {
    if (!chrome) return
    const t = setTimeout(() => setChrome(false), 2600)
    return () => clearTimeout(t)
  }, [chrome, index])

  const go = useCallback((delta: number) => setIndex((i) => Math.max(0, Math.min(pages.length - 1, i + delta))), [pages.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'N'].includes(k)) go(1)
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p', 'P'].includes(k)) go(-1)
      else if (k === 'Home') setIndex(0)
      else if (k === 'End') setIndex(pages.length - 1)
      else if (k === 'Escape') exit()
      else if (k === 'l' || k === 'L') setTool((t) => (t === 'laser' ? 'click' : 'laser'))
      else if (k === 'd' || k === 'D') setTool((t) => (t === 'pen' ? 'click' : 'pen'))
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [go, exit, pages.length])

  // Page layer
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = size.w * dpr
    c.height = size.h * dpr
    const ctx = c.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.setTransform(dpr * view.zoom, 0, 0, dpr * view.zoom, dpr * view.panX, dpr * view.panY)
    renderPage(ctx, page, { doc, resources })
  }, [page, doc, size, view.zoom, view.panX, view.panY, resVersion])

  // Ink and laser layer
  const drawOverlay = useCallback(() => {
    const c = overlayRef.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    if (c.width !== size.w * dpr) {
      c.width = size.w * dpr
      c.height = size.h * dpr
    }
    const ctx = c.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.setTransform(dpr * view.zoom, 0, 0, dpr * view.zoom, dpr * view.panX, dpr * view.panY)
    for (const s of ink[page.id] ?? []) drawStroke(ctx, s, false)
    if (drawing.current) drawStroke(ctx, drawing.current, false)
    const now = performance.now()
    laser.current = laser.current.filter((p) => now - p.t < 600)
    const pts = laser.current
    for (let i = 1; i < pts.length; i++) {
      const k = 1 - (now - pts[i].t) / 600
      ctx.strokeStyle = `rgba(255,40,60,${0.8 * k})`
      ctx.lineWidth = (4 + 6 * k) / view.zoom
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y)
      ctx.lineTo(pts[i].x, pts[i].y)
      ctx.stroke()
    }
    const last = pts[pts.length - 1]
    if (last && tool === 'laser') {
      ctx.fillStyle = 'rgba(255,50,60,0.95)'
      ctx.beginPath()
      ctx.arc(last.x, last.y, 9 / view.zoom, 0, Math.PI * 2)
      ctx.fill()
    }
    if (pts.length) requestAnimationFrame(drawOverlay)
  }, [ink, page.id, size, view.zoom, view.panX, view.panY, tool])

  useEffect(() => {
    drawOverlay()
  }, [drawOverlay])

  const toPage = (e: React.PointerEvent) => ({ x: (e.clientX - view.panX) / view.zoom, y: (e.clientY - view.panY) / view.zoom })

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.present-bar')) return
    if (e.button === 2) {
      go(-1)
      return
    }
    if (tool === 'click') {
      go(1)
      return
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const p = toPage(e)
    if (tool === 'pen') {
      drawing.current = {
        id: `tmp${Date.now()}`,
        type: 'stroke',
        tool: 'pen',
        style: 'pen',
        color: '#FF3B4E',
        width: 5,
        opacity: 1,
        points: [p.x, p.y, e.pointerType === 'pen' ? e.pressure : 0.5],
        pressure: e.pointerType === 'pen'
      }
    } else {
      laser.current.push({ ...p, t: performance.now() })
    }
    drawOverlay()
  }
  const onMove = (e: React.PointerEvent) => {
    if (!chrome && e.clientY > size.h - 120) setChrome(true)
    const p = toPage(e)
    if (tool === 'laser') {
      laser.current.push({ ...p, t: performance.now() })
      if (laser.current.length === 1) drawOverlay()
    } else if (drawing.current) {
      drawing.current = { ...drawing.current, points: [...drawing.current.points, p.x, p.y, e.pointerType === 'pen' ? e.pressure : 0.5] }
      drawOverlay()
    }
  }
  const onUp = () => {
    const s = drawing.current
    drawing.current = null
    if (s) setInk((m) => ({ ...m, [page.id]: [...(m[page.id] ?? []), s] }))
  }

  return (
    <div
      className={cx('present', `present--${tool}`)}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
      role="dialog"
      aria-label={`Presentation, page ${index + 1} of ${pages.length}`}
    >
      <canvas ref={canvasRef} className="present__layer" style={{ width: size.w, height: size.h }} />
      <canvas ref={overlayRef} className="present__layer" style={{ width: size.w, height: size.h }} />
      <div className={cx('present-bar', chrome && 'is-visible')} onPointerEnter={() => setChrome(true)}>
        <button type="button" aria-label="Previous page" onClick={() => go(-1)} disabled={index === 0}>
          <ChevronLeft size={20} />
        </button>
        <span className="present-bar__count">
          {index + 1} / {pages.length}
        </span>
        <button type="button" aria-label="Next page" onClick={() => go(1)} disabled={index >= pages.length - 1}>
          <ChevronRight size={20} />
        </button>
        <span className="present-bar__sep" />
        <button type="button" aria-label="Laser pointer (L)" aria-pressed={tool === 'laser'} className={cx(tool === 'laser' && 'is-active')} onClick={() => setTool(tool === 'laser' ? 'click' : 'laser')}>
          <Pointer size={18} />
        </button>
        <button type="button" aria-label="Temporary ink (D)" aria-pressed={tool === 'pen'} className={cx(tool === 'pen' && 'is-active')} onClick={() => setTool(tool === 'pen' ? 'click' : 'pen')}>
          <Pencil size={18} />
        </button>
        <button type="button" aria-label="Clear temporary ink" onClick={() => setInk((m) => ({ ...m, [page.id]: [] }))} disabled={!(ink[page.id]?.length)}>
          <Eraser size={18} />
        </button>
        <span className="present-bar__sep" />
        <button type="button" aria-label="End presentation (Esc)" onClick={exit}>
          <X size={18} />
        </button>
      </div>
    </div>
  )
}
