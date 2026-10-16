import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { objectBounds, rectsIntersect, type Rect } from '../../core/geometry'
import type { BoardObject, Page } from '../../core/model'
import { renderPage } from '../../core/render'
import { resources } from '../../core/resources'
import { clampZoom, screenToPage, zoomAt, type Viewport } from '../../core/viewport'
import { api } from '../../platform'
import { currentPage, useDoc } from '../../state/doc'
import { importPdfFile, openBytes, openDocument } from '../../state/files'
import { insertImages } from '../../state/ops'
import { useSettings } from '../../state/settings'
import { useUi, type ToolId } from '../../state/ui'
import { fittedViewport } from '../../state/view'
import { EraserTool, InkTool, LaserTool } from '../../tools/inkTools'
import { handlePositions, SelectTool, selectionFrame } from '../../tools/selectTool'
import { LineTool, PolygonTool, ShapeTool } from '../../tools/shapeTools'
import { finishTextEdit, MathTool, PanTool, TextTool } from '../../tools/textTools'
import type { PointerSample, Tool, ToolContext } from '../../tools/types'
import { CanvasContextMenu } from './CanvasContextMenu'
import { CellEditor, TextEditor } from './Editors'
import { Instruments } from './Instruments'
import { keyState, pointerChannel, renderChannel } from './bus'

function createTools(): Record<ToolId, Tool> {
  return {
    select: new SelectTool(),
    pan: new PanTool(),
    pen: new InkTool('pen'),
    highlighter: new InkTool('highlighter'),
    eraser: new EraserTool(),
    shape: new ShapeTool(),
    line: new LineTool(),
    polygon: new PolygonTool(),
    text: new TextTool(),
    math: new MathTool(),
    laser: new LaserTool()
  }
}

export function CanvasView() {
  const hostRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const tools = useMemo(createTools, [])
  const page = useDoc((s) => currentPage(s))
  const doc = useDoc((s) => s.doc)
  const selection = useDoc((s) => s.selection)
  const toolId = useUi((s) => s.tool)
  const viewSize = useUi((s) => s.viewSize)
  const stored = useUi((s) => s.viewports[page.id])
  const textEditId = useUi((s) => s.textEdit?.draft.id ?? null)
  const cellEdit = useUi((s) => s.cellEdit)
  const touchAction = useSettings((s) => s.settings.touchAction)
  const dockPosition = useSettings((s) => s.settings.toolbar.position)
  const [cursor, setCursor] = useState('default')
  const [resVersion, setResVersion] = useState(0)
  const [menu, setMenu] = useState<{ x: number; y: number; px: number; py: number } | null>(null)
  const [dpr, setDpr] = useState(window.devicePixelRatio || 1)

  const viewport: Viewport = useMemo(() => {
    if (stored && !stored.fit) return stored
    return fittedViewport(page)
    // viewSize is a dependency so fitted viewports follow window resizes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored, page.width, page.height, page.id, viewSize.w, viewSize.h, dockPosition])

  const viewportRef = useRef(viewport)
  viewportRef.current = viewport
  const pageRef = useRef<Page>(page)
  pageRef.current = page

  const setViewport = useCallback((v: Viewport) => {
    useUi.getState().setViewport(pageRef.current.id, { ...v, zoom: clampZoom(v.zoom), fit: false })
  }, [])

  // ---------------------------------------------------------------------------
  // Sizing

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const update = () => {
      const w = host.clientWidth
      const h = host.clientHeight
      const cur = useUi.getState().viewSize
      if (cur.w !== w || cur.h !== h) useUi.getState().set({ viewSize: { w, h } })
      setDpr(window.devicePixelRatio || 1)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(host)
    // Display scaling changes (moving between monitors) change devicePixelRatio.
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    mq.addEventListener('change', update)
    return () => {
      ro.disconnect()
      mq.removeEventListener('change', update)
    }
  }, [])

  useEffect(() => resources.subscribe(() => setResVersion((v) => v + 1)), [])
  useEffect(() => {
    const onFonts = () => setResVersion((v) => v + 1)
    document.fonts?.addEventListener('loadingdone', onFonts)
    return () => document.fonts?.removeEventListener('loadingdone', onFonts)
  }, [])

  // ---------------------------------------------------------------------------
  // Base layer: page background and committed objects

  const skipIds = useMemo(() => new Set(textEditId ? [textEditId] : []), [textEditId])

  useEffect(() => {
    const canvas = baseRef.current
    if (!canvas) return
    const frame = requestAnimationFrame(() => {
      const w = Math.max(1, Math.round(viewSize.w * dpr))
      const h = Math.max(1, Math.round(viewSize.h * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      const ctx = canvas.getContext('2d')!
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const { zoom, panX, panY } = viewport
      ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * panX, dpr * panY)
      // Page shadow
      ctx.save()
      ctx.shadowColor = 'rgba(15, 22, 32, 0.20)'
      ctx.shadowBlur = 22 * dpr
      ctx.shadowOffsetY = 3 * dpr
      ctx.fillStyle = page.background.color
      ctx.fillRect(0, 0, page.width, page.height)
      ctx.restore()
      // Only draw what is visible.
      const visible: Rect = { x: -panX / zoom, y: -panY / zoom, w: viewSize.w / zoom, h: viewSize.h / zoom }
      const culled: Page = { ...page, objects: page.objects.filter((o: BoardObject) => rectsIntersect(objectBounds(o), visible)) }
      renderPage(ctx, culled, { doc, resources, skipIds })
      renderChannel.emit(canvas)
    })
    return () => cancelAnimationFrame(frame)
  }, [doc, page, viewport, viewSize, dpr, resVersion, skipIds])

  // ---------------------------------------------------------------------------
  // Overlay layer: selection, previews, cursors

  const overlayFrame = useRef(0)
  const activeTool = useRef<Tool | null>(null)
  const drawOverlay = useCallback(() => {
    overlayFrame.current = 0
    const canvas = overlayRef.current
    if (!canvas) return
    const { w, h } = useUi.getState().viewSize
    const ratio = window.devicePixelRatio || 1
    const cw = Math.max(1, Math.round(w * ratio))
    const ch = Math.max(1, Math.round(h * ratio))
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw
      canvas.height = ch
    }
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, cw, ch)
    const v = viewportRef.current
    ctx.setTransform(ratio * v.zoom, 0, 0, ratio * v.zoom, ratio * v.panX, ratio * v.panY)

    // Selection
    const s = useDoc.getState()
    const ids = new Set(s.selection)
    const textEdit = useUi.getState().textEdit
    const sel = currentPage(s).objects.filter((o) => ids.has(o.id) && o.id !== textEdit?.draft.id)
    if (sel.length) {
      const z = v.zoom
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--c-selection').trim() || '#0f8b78'
      ctx.save()
      ctx.strokeStyle = accent
      ctx.lineWidth = 1 / z
      if (sel.length > 1) {
        ctx.globalAlpha = 0.5
        for (const o of sel) {
          const b = objectBounds(o)
          ctx.strokeRect(b.x, b.y, b.w, b.h)
        }
        ctx.globalAlpha = 1
      }
      if (sel.length === 1 && sel[0].type === 'line') {
        const l = sel[0]
        for (const [x, y] of [
          [l.x1, l.y1],
          [l.x2, l.y2]
        ]) {
          ctx.beginPath()
          ctx.arc(x, y, 6 / z, 0, Math.PI * 2)
          ctx.fillStyle = '#ffffff'
          ctx.fill()
          ctx.lineWidth = 2 / z
          ctx.stroke()
        }
      } else {
        const f = selectionFrame(sel)!
        ctx.setLineDash([5 / z, 4 / z])
        ctx.lineWidth = 1.5 / z
        ctx.strokeRect(f.x, f.y, f.w, f.h)
        ctx.setLineDash([])
        const hs = 9 / z
        const onlyCorners = sel.length === 1 && (sel[0].type === 'math' || sel[0].type === 'image')
        for (const [hname, hx, hy] of handlePositions(f)) {
          if (onlyCorners && hname.length === 1) continue
          ctx.fillStyle = '#ffffff'
          ctx.lineWidth = 1.5 / z
          ctx.beginPath()
          ctx.roundRect(hx - hs / 2, hy - hs / 2, hs, hs, 2 / z)
          ctx.fill()
          ctx.stroke()
        }
      }
      ctx.restore()
    }

    const tool = activeTool.current ?? tools[useUi.getState().tool]
    tool.drawOverlay?.(ctx, v.zoom, performance.now())
    if (tool.animating?.()) overlayFrame.current = requestAnimationFrame(drawOverlay)
  }, [tools])

  const requestOverlay = useCallback(() => {
    if (!overlayFrame.current) overlayFrame.current = requestAnimationFrame(drawOverlay)
  }, [drawOverlay])

  useEffect(() => {
    requestOverlay()
  }, [selection, viewport, viewSize, dpr, doc, toolId, textEditId, requestOverlay])

  // Cancel in-progress gestures when the tool or page changes.
  useEffect(() => {
    const ctx = makeCtx()
    for (const t of Object.values(tools)) if (t !== tools[toolId]) t.cancel(ctx)
    setCursor(tools[toolId].cursor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolId, page.id])

  // ---------------------------------------------------------------------------
  // Input

  const makeCtx = useCallback(
    (): ToolContext => ({
      pageId: pageRef.current.id,
      viewport: viewportRef.current,
      setViewport,
      requestOverlay,
      setCursor
    }),
    [setViewport, requestOverlay]
  )

  const sampleFrom = useCallback((e: PointerEvent | React.PointerEvent): PointerSample => {
    const rect = hostRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const p = screenToPage(viewportRef.current, sx, sy)
    const ne = 'nativeEvent' in e ? e.nativeEvent : e
    return {
      x: p.x,
      y: p.y,
      sx,
      sy,
      pressure: e.pointerType === 'mouse' ? 0.5 : e.pressure,
      pointerType: e.pointerType,
      shift: e.shiftKey,
      alt: e.altKey,
      mod: e.ctrlKey || e.metaKey,
      buttons: e.buttons,
      time: ne.timeStamp
    }
  }, [])

  const activePointer = useRef<number | null>(null)
  const touches = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ dist: number; cx: number; cy: number; v: Viewport } | null>(null)

  const startGesture = () => {
    const pts = [...touches.current.values()]
    if (pts.length < 2) {
      // Single-finger pan.
      const p = pts[0]
      gesture.current = p ? { dist: 0, cx: p.x, cy: p.y, v: viewportRef.current } : null
      return
    }
    const [a, b] = pts
    gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, v: viewportRef.current }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== overlayRef.current) return
    if (e.button === 2) return
    hostRef.current?.focus({ preventScroll: true })
    setMenu(null)
    const ui = useUi.getState()
    if (ui.textEdit || ui.cellEdit) {
      // Clicking elsewhere finishes inline editing.
      const editingText = !!ui.textEdit
      ;(document.activeElement as HTMLElement | null)?.blur()
      if (useUi.getState().textEdit) finishTextEdit()
      if (useUi.getState().cellEdit) useUi.getState().set({ cellEdit: null })
      if (editingText && toolId === 'text') return
    }
    const rect = hostRef.current!.getBoundingClientRect()
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top })
      if (touches.current.size >= 2 || touchAction === 'pan') {
        // Multi-touch (or touch set to pan) cancels any stroke and navigates instead.
        if (activeTool.current && activePointer.current !== null) {
          activeTool.current.cancel(makeCtx())
          activeTool.current = null
          activePointer.current = null
        }
        startGesture()
        hostRef.current?.setPointerCapture(e.pointerId)
        return
      }
    }
    if (activePointer.current !== null) return
    let tool: Tool = tools[toolId]
    if (e.button === 1 || keyState.space) tool = tools.pan
    else if (e.pointerType === 'pen' && (e.buttons & 32) === 32) tool = tools.eraser
    activeTool.current = tool
    activePointer.current = e.pointerId
    hostRef.current?.setPointerCapture(e.pointerId)
    e.preventDefault()
    tool.down(sampleFrom(e), makeCtx())
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = hostRef.current!.getBoundingClientRect()
    pointerChannel.emit({ x: e.clientX - rect.left, y: e.clientY - rect.top, inside: true })
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top })
      const g = gesture.current
      if (g) {
        const pts = [...touches.current.values()]
        if (pts.length >= 2 && g.dist > 0) {
          const [a, b] = pts
          const dist = Math.hypot(a.x - b.x, a.y - b.y)
          const cx = (a.x + b.x) / 2
          const cy = (a.y + b.y) / 2
          const zoomed = zoomAt(g.v, g.v.zoom * (dist / g.dist), g.cx, g.cy)
          setViewport({ ...zoomed, panX: zoomed.panX + (cx - g.cx), panY: zoomed.panY + (cy - g.cy) })
        } else if (pts.length === 1) {
          setViewport({ ...g.v, panX: g.v.panX + (pts[0].x - g.cx), panY: g.v.panY + (pts[0].y - g.cy) })
        }
        return
      }
    }
    const tool = activeTool.current
    if (tool && e.pointerId === activePointer.current) {
      const native = e.nativeEvent
      const coalesced = native.getCoalescedEvents?.() ?? []
      const samples = (coalesced.length ? coalesced : [native]).map((ev) => sampleFrom(ev))
      tool.move(sampleFrom(e), samples, makeCtx())
    } else if (activePointer.current === null && e.target === overlayRef.current) {
      const hoverTool = keyState.space ? tools.pan : tools[toolId]
      hoverTool.hover?.(sampleFrom(e), makeCtx())
    }
  }

  const endPointer = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
      touches.current.delete(e.pointerId)
      if (gesture.current) {
        if (touches.current.size === 0) gesture.current = null
        else startGesture()
        return
      }
    }
    if (e.pointerId !== activePointer.current) return
    const tool = activeTool.current
    activeTool.current = null
    activePointer.current = null
    if (!tool) return
    if (cancelled) tool.cancel(makeCtx())
    else tool.up(sampleFrom(e), makeCtx())
    setCursor(keyState.space ? 'grab' : tools[toolId].cursor)
    requestOverlay()
  }

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // With pointer capture on the host, click events target the host itself.
    if (e.target !== overlayRef.current && e.target !== hostRef.current) return
    const rect = hostRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const p = screenToPage(viewportRef.current, sx, sy)
    tools[toolId].doubleClick?.(
      { x: p.x, y: p.y, sx, sy, pressure: 0.5, pointerType: 'mouse', shift: e.shiftKey, alt: e.altKey, mod: e.ctrlKey || e.metaKey, buttons: 0, time: e.timeStamp },
      makeCtx()
    )
  }

  // Wheel: scroll pans, Ctrl/⌘ (and trackpad pinch) zooms around the cursor.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('.no-canvas-wheel')) return
      e.preventDefault()
      const rect = host.getBoundingClientRect()
      const v = viewportRef.current
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp((-e.deltaY * unit) / 400)
        setViewport(zoomAt(v, v.zoom * factor, e.clientX - rect.left, e.clientY - rect.top))
      } else {
        const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit
        const dy = (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit
        setViewport({ ...v, panX: v.panX - dx, panY: v.panY - dy })
      }
    }
    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
  }, [setViewport])

  // Tool keyboard input (e.g. polygon Enter/Backspace) and Escape handling.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, [contenteditable="true"]')) return
      if (useUi.getState().dialog) return
      const tool = activeTool.current ?? tools[useUi.getState().tool]
      if (tool.key?.(e, makeCtx())) {
        e.preventDefault()
        e.stopImmediatePropagation()
        return
      }
      if (e.key === 'Escape' && activeTool.current) {
        activeTool.current.cancel(makeCtx())
        activeTool.current = null
        activePointer.current = null
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [tools, makeCtx])

  // Space bar: temporary hand tool.
  useEffect(() => {
    const onSpace = () => setCursor(keyState.space ? 'grab' : tools[useUi.getState().tool].cursor)
    window.addEventListener('tb-space', onSpace)
    return () => window.removeEventListener('tb-space', onSpace)
  }, [tools])

  // ---------------------------------------------------------------------------
  // Drag & drop of images, PDFs and lessons

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    if (!files.length) return
    const rect = hostRef.current!.getBoundingClientRect()
    const at = screenToPage(viewportRef.current, e.clientX - rect.left, e.clientY - rect.top)
    const lesson = files.find((f) => f.name.toLowerCase().endsWith('.tboard'))
    if (lesson) {
      const path = api.getPathForFile(lesson)
      if (path) void openDocument(path)
      else openBytes(new Uint8Array(await lesson.arrayBuffer()), null)
      return
    }
    const pdf = files.find((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (pdf) {
      await importPdfFile({ name: pdf.name, bytes: new Uint8Array(await pdf.arrayBuffer()) })
      return
    }
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (!images.length) {
      useUi.getState().toast('Only images, PDFs and lesson files can be dropped here.')
      return
    }
    const loaded = await Promise.all(images.map(async (f) => ({ name: f.name, mime: f.type, bytes: new Uint8Array(await f.arrayBuffer()) })))
    await insertImages(loaded, at)
  }

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (e.target !== overlayRef.current) return
    const rect = hostRef.current!.getBoundingClientRect()
    const p = screenToPage(viewportRef.current, e.clientX - rect.left, e.clientY - rect.top)
    setMenu({ x: e.clientX, y: e.clientY, px: p.x, py: p.y })
  }

  return (
    <div
      ref={hostRef}
      className="canvas-host"
      data-canvas-host
      tabIndex={-1}
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endPointer(e, false)}
      onPointerCancel={(e) => endPointer(e, true)}
      onLostPointerCapture={(e) => {
        if (e.pointerId === activePointer.current) endPointer(e, false)
      }}
      onPointerLeave={() => {
        pointerChannel.emit({ x: 0, y: 0, inside: false })
        const t = tools[toolId] as Tool & { leave?: (ctx: ToolContext) => void }
        if (!activeTool.current) t.leave?.(makeCtx())
      }}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <canvas ref={baseRef} className="canvas-layer" aria-label="Whiteboard page" />
      <canvas ref={overlayRef} className="canvas-layer canvas-layer--overlay" />
      <Instruments viewport={viewport} />
      {textEditId && <TextEditor viewport={viewport} />}
      {cellEdit && <CellEditor viewport={viewport} />}
      {menu && <CanvasContextMenu x={menu.x} y={menu.y} at={{ x: menu.px, y: menu.py }} onClose={() => setMenu(null)} />}
    </div>
  )
}
