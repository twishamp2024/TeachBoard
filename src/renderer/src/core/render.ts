import { isDarkColor } from './color'
import { arrowSize, roundRectRadius, shapeOutline } from './geometry'
import type { Background, BoardObject, DashStyle, LessonDocument, LineObject, Page, ShapeObject, TableObject, TextObject } from './model'
import type { ResourceCache } from './resources'
import { drawStroke } from './strokes'
import { canvasMeasure, firstBaselineOffset, fontCss, fontString, layoutText, LINE_HEIGHT, TEXT_PADDING, wrapText, type MeasureFn } from './text'

/**
 * Draws pages in page coordinates. The caller sets the context transform
 * (zoom, pan, device pixel ratio, export scale), so the same code renders the
 * editor, thumbnails, presentation and exports.
 */
export interface RenderContext {
  doc: LessonDocument
  resources: ResourceCache
  measure?: MeasureFn
  /** Objects to leave out (e.g. the text currently being edited). */
  skipIds?: ReadonlySet<string>
  /** Set by renderPage: highlighters blend normally on dark pages. */
  darkPage?: boolean
}

export function renderPage(ctx: CanvasRenderingContext2D, page: Page, rc: RenderContext): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, page.width, page.height)
  ctx.clip()
  drawBackground(ctx, page.width, page.height, page.background, rc)
  const prc: RenderContext = { ...rc, darkPage: isDarkColor(page.background.color) }
  for (const o of page.objects) {
    if (prc.skipIds?.has(o.id)) continue
    drawObject(ctx, o, prc)
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Backgrounds

export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, bg: Background, rc: RenderContext): void {
  ctx.fillStyle = bg.color
  ctx.fillRect(0, 0, w, h)
  if (bg.imageAssetId) {
    const img = rc.resources.assetImage(rc.doc.assets[bg.imageAssetId])
    if (img) drawFittedImage(ctx, img, w, h, bg.imageFit)
  }
  drawPattern(ctx, w, h, bg)
}

function drawFittedImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number, fit: Background['imageFit']): void {
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  if (!iw || !ih) return
  let dw = w
  let dh = h
  if (fit === 'cover' || fit === 'contain') {
    const s = fit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih)
    dw = iw * s
    dh = ih * s
  } else if (fit === 'center') {
    dw = iw
    dh = ih
  }
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

function hLines(ctx: CanvasRenderingContext2D, w: number, from: number, to: number, step: number): void {
  for (let y = from; y <= to; y += step) {
    ctx.moveTo(0, Math.round(y) + 0.5)
    ctx.lineTo(w, Math.round(y) + 0.5)
  }
}

export function drawPattern(ctx: CanvasRenderingContext2D, w: number, h: number, bg: Background): void {
  const s = Math.max(4, bg.spacing)
  ctx.save()
  ctx.strokeStyle = bg.patternColor
  ctx.fillStyle = bg.patternColor
  ctx.lineWidth = 1
  switch (bg.pattern) {
    case 'grid': {
      ctx.beginPath()
      for (let x = s; x < w; x += s) {
        ctx.moveTo(Math.round(x) + 0.5, 0)
        ctx.lineTo(Math.round(x) + 0.5, h)
      }
      hLines(ctx, w, s, h, s)
      ctx.stroke()
      break
    }
    case 'graph': {
      ctx.globalAlpha = 0.5
      ctx.beginPath()
      for (let x = s; x < w; x += s) {
        ctx.moveTo(Math.round(x) + 0.5, 0)
        ctx.lineTo(Math.round(x) + 0.5, h)
      }
      hLines(ctx, w, s, h, s)
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.lineWidth = 1.75
      ctx.beginPath()
      for (let x = s * 5; x < w; x += s * 5) {
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
      }
      for (let y = s * 5; y < h; y += s * 5) {
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
      }
      ctx.stroke()
      break
    }
    case 'dots': {
      const r = Math.max(1.4, s / 22)
      for (let y = s; y < h; y += s) {
        for (let x = s; x < w; x += s) {
          ctx.beginPath()
          ctx.arc(x, y, r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      break
    }
    case 'lines': {
      ctx.beginPath()
      hLines(ctx, w, s * 2.5, h - s * 0.5, s)
      ctx.stroke()
      ctx.strokeStyle = '#E8A0A4'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(s * 2.5, 0)
      ctx.lineTo(s * 2.5, h)
      ctx.stroke()
      break
    }
    case 'handwriting': {
      const pitch = s * 2.4
      for (let y = s * 1.5; y + s * 1.5 < h; y += pitch) {
        ctx.lineWidth = 1.25
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
        ctx.setLineDash([8, 7])
        ctx.beginPath()
        ctx.moveTo(0, y + s * 0.5)
        ctx.lineTo(w, y + s * 0.5)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.lineWidth = 2.25
        ctx.beginPath()
        ctx.moveTo(0, y + s)
        ctx.lineTo(w, y + s)
        ctx.stroke()
        ctx.lineWidth = 1
        ctx.globalAlpha = 0.45
        ctx.beginPath()
        ctx.moveTo(0, y + s * 1.5)
        ctx.lineTo(w, y + s * 1.5)
        ctx.stroke()
        ctx.globalAlpha = 1
      }
      break
    }
    case 'music': {
      const gap = s / 4
      const staff = gap * 4
      const margin = Math.min(80, w * 0.06)
      ctx.lineWidth = 1.25
      for (let y = s * 2; y + staff < h - s; y += staff + s * 2.25) {
        ctx.beginPath()
        for (let i = 0; i < 5; i++) {
          ctx.moveTo(margin, y + i * gap)
          ctx.lineTo(w - margin, y + i * gap)
        }
        ctx.moveTo(margin, y)
        ctx.lineTo(margin, y + staff)
        ctx.moveTo(w - margin, y)
        ctx.lineTo(w - margin, y + staff)
        ctx.stroke()
      }
      break
    }
    case 'isometric': {
      const t = Math.tan(Math.PI / 6)
      ctx.globalAlpha = 0.85
      ctx.beginPath()
      const dx = s * Math.cos(Math.PI / 6)
      for (let x = 0; x <= w; x += dx) {
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
      }
      const span = w * t
      for (let c = -span; c < h + span; c += s) {
        ctx.moveTo(0, c)
        ctx.lineTo(w, c + w * t)
        ctx.moveTo(0, c)
        ctx.lineTo(w, c - w * t)
      }
      ctx.stroke()
      break
    }
    case 'coordinate': {
      const cx = Math.round(w / 2 / s) * s
      const cy = Math.round(h / 2 / s) * s
      ctx.globalAlpha = 0.55
      ctx.beginPath()
      for (let x = cx % s; x < w; x += s) {
        ctx.moveTo(Math.round(x) + 0.5, 0)
        ctx.lineTo(Math.round(x) + 0.5, h)
      }
      hLines(ctx, w, cy % s, h, s)
      ctx.stroke()
      ctx.globalAlpha = 1
      const axis = '#3A4350'
      ctx.strokeStyle = axis
      ctx.fillStyle = axis
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(8, cy)
      ctx.lineTo(w - 8, cy)
      ctx.moveTo(cx, h - 8)
      ctx.lineTo(cx, 8)
      ctx.stroke()
      const head = 12
      ctx.beginPath()
      ctx.moveTo(w - 4, cy)
      ctx.lineTo(w - 4 - head, cy - head / 2)
      ctx.lineTo(w - 4 - head, cy + head / 2)
      ctx.closePath()
      ctx.moveTo(cx, 4)
      ctx.lineTo(cx - head / 2, 4 + head)
      ctx.lineTo(cx + head / 2, 4 + head)
      ctx.closePath()
      ctx.fill()
      ctx.font = `500 ${Math.max(10, Math.min(16, s * 0.34))}px Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.lineWidth = 1.5
      const labelEvery = s < 28 ? 2 : 1
      for (let i = 1; cx + i * s < w - s; i++) {
        for (const sign of [1, -1]) {
          const x = cx + sign * i * s
          if (x < s * 0.5) continue
          ctx.beginPath()
          ctx.moveTo(x, cy - 5)
          ctx.lineTo(x, cy + 5)
          ctx.stroke()
          if (i % labelEvery === 0) ctx.fillText(String(sign * i), x, cy + 8)
        }
      }
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      for (let i = 1; cy + i * s < h - s * 0.5 || cy - i * s > s * 0.5; i++) {
        for (const sign of [1, -1]) {
          const y = cy - sign * i * s
          if (y < s * 0.5 || y > h - s * 0.5) continue
          ctx.beginPath()
          ctx.moveTo(cx - 5, y)
          ctx.lineTo(cx + 5, y)
          ctx.stroke()
          if (i % labelEvery === 0) ctx.fillText(String(sign * i), cx - 9, y)
        }
      }
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'
      ctx.fillText('0', cx - 7, cy + 7)
      ctx.font = `italic 600 ${Math.max(14, Math.min(22, s * 0.5))}px Merriweather, serif`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'bottom'
      ctx.fillText('x', w - 10, cy - 10)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText('y', cx + 12, 8)
      break
    }
    default:
      break
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Objects

export function dashPattern(dash: DashStyle, width: number): number[] {
  if (dash === 'dashed') return [width * 3.2, width * 2.2]
  if (dash === 'dotted') return [0.01, width * 2.2]
  return []
}

function applyStrokeStyle(ctx: CanvasRenderingContext2D, color: string, width: number, dash: DashStyle): void {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineJoin = 'round'
  ctx.lineCap = dash === 'dotted' ? 'round' : 'round'
  ctx.setLineDash(dashPattern(dash, width))
}

export function shapePath(s: Pick<ShapeObject, 'kind' | 'x' | 'y' | 'w' | 'h' | 'flipX' | 'flipY'>): Path2D {
  const p = new Path2D()
  if (s.kind === 'ellipse') {
    p.ellipse(s.x + s.w / 2, s.y + s.h / 2, Math.max(0.5, s.w / 2), Math.max(0.5, s.h / 2), 0, 0, Math.PI * 2)
    return p
  }
  if (s.kind === 'roundRect') {
    p.roundRect(s.x, s.y, s.w, s.h, roundRectRadius(s.w, s.h))
    return p
  }
  const pts = shapeOutline(s)
  p.moveTo(pts[0], pts[1])
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1])
  p.closePath()
  return p
}

function drawShape(ctx: CanvasRenderingContext2D, s: ShapeObject): void {
  const path = shapePath(s)
  if (s.fill) {
    ctx.fillStyle = s.fill
    ctx.fill(path)
  }
  if (s.strokeWidth > 0) {
    applyStrokeStyle(ctx, s.stroke, s.strokeWidth, s.dash)
    ctx.stroke(path)
  }
}

export function drawLine(ctx: CanvasRenderingContext2D, l: Pick<LineObject, 'x1' | 'y1' | 'x2' | 'y2' | 'stroke' | 'strokeWidth' | 'dash' | 'startCap' | 'endCap'>): void {
  const len = Math.hypot(l.x2 - l.x1, l.y2 - l.y1)
  const ux = len ? (l.x2 - l.x1) / len : 1
  const uy = len ? (l.y2 - l.y1) / len : 0
  const head = Math.min(arrowSize(l.strokeWidth), len * 0.45 || arrowSize(l.strokeWidth))
  const inset = (cap: LineObject['startCap']) => (cap === 'arrow' ? head * 0.75 : 0)
  const sx = l.x1 + ux * inset(l.startCap)
  const sy = l.y1 + uy * inset(l.startCap)
  const ex = l.x2 - ux * inset(l.endCap)
  const ey = l.y2 - uy * inset(l.endCap)
  applyStrokeStyle(ctx, l.stroke, l.strokeWidth, l.dash)
  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.lineTo(ex, ey)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = l.stroke
  const cap = (cap: LineObject['startCap'], tx: number, ty: number, dx: number, dy: number) => {
    if (cap === 'arrow') {
      const bx = tx - dx * head
      const by = ty - dy * head
      const px = -dy * head * 0.5
      const py = dx * head * 0.5
      ctx.beginPath()
      ctx.moveTo(tx, ty)
      ctx.lineTo(bx + px, by + py)
      ctx.lineTo(bx - px, by - py)
      ctx.closePath()
      ctx.fill()
    } else if (cap === 'dot') {
      ctx.beginPath()
      ctx.arc(tx, ty, Math.max(3, l.strokeWidth * 1.6), 0, Math.PI * 2)
      ctx.fill()
    }
  }
  cap(l.endCap, l.x2, l.y2, ux, uy)
  cap(l.startCap, l.x1, l.y1, -ux, -uy)
}

function drawText(ctx: CanvasRenderingContext2D, t: TextObject, measure: MeasureFn): void {
  const { lines } = layoutText(t, measure)
  if (t.background) {
    ctx.fillStyle = t.background
    ctx.beginPath()
    ctx.roundRect(t.x, t.y, t.w, t.h, 4)
    ctx.fill()
  }
  ctx.font = fontString(t)
  ctx.fillStyle = t.color
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = t.align
  const lh = t.fontSize * LINE_HEIGHT
  const ax = t.align === 'left' ? t.x + TEXT_PADDING : t.align === 'center' ? t.x + t.w / 2 : t.x + t.w - TEXT_PADDING
  const firstBaseline = t.y + firstBaselineOffset(t)
  for (let i = 0; i < lines.length; i++) {
    const y = firstBaseline + i * lh
    ctx.fillText(lines[i], ax, y)
    if (t.underline && lines[i]) {
      const lw = measure(fontString(t), lines[i])
      const lx = t.align === 'left' ? ax : t.align === 'center' ? ax - lw / 2 : ax - lw
      ctx.fillRect(lx, y + t.fontSize * 0.12, lw, Math.max(1, t.fontSize / 14))
    }
  }
}

function drawTable(ctx: CanvasRenderingContext2D, t: TableObject, measure: MeasureFn): void {
  const totalW = t.colWidths.reduce((a, b) => a + b, 0)
  const totalH = t.rowHeights.reduce((a, b) => a + b, 0)
  if (t.fill) {
    ctx.fillStyle = t.fill
    ctx.fillRect(t.x, t.y, totalW, totalH)
  }
  if (t.headerFill) {
    ctx.fillStyle = t.headerFill
    ctx.fillRect(t.x, t.y, totalW, t.rowHeights[0])
  }
  const pad = 8
  let y = t.y
  for (let r = 0; r < t.rowHeights.length; r++) {
    let x = t.x
    const rh = t.rowHeights[r]
    for (let c = 0; c < t.colWidths.length; c++) {
      const cw = t.colWidths[c]
      const text = t.cells[r]?.[c] ?? ''
      if (text) {
        const font = `${r === 0 && t.headerFill ? '700' : '400'} ${t.fontSize}px ${fontCss(t.fontFamily)}`
        const lines = wrapText(text, font, Math.max(4, cw - pad * 2), measure)
        const lh = t.fontSize * LINE_HEIGHT
        const blockH = lines.length * lh
        ctx.save()
        ctx.beginPath()
        ctx.rect(x, y, cw, rh)
        ctx.clip()
        ctx.font = font
        ctx.fillStyle = t.color
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        let ly = y + rh / 2 - blockH / 2 + lh / 2
        for (const line of lines) {
          ctx.fillText(line, x + cw / 2, ly)
          ly += lh
        }
        ctx.restore()
      }
      x += cw
    }
    y += rh
  }
  if (t.strokeWidth > 0) {
    ctx.strokeStyle = t.stroke
    ctx.lineWidth = t.strokeWidth
    ctx.setLineDash([])
    ctx.beginPath()
    let gx = t.x
    for (let c = 0; c <= t.colWidths.length; c++) {
      ctx.moveTo(gx, t.y)
      ctx.lineTo(gx, t.y + totalH)
      gx += t.colWidths[c] ?? 0
    }
    let gy = t.y
    for (let r = 0; r <= t.rowHeights.length; r++) {
      ctx.moveTo(t.x, gy)
      ctx.lineTo(t.x + totalW, gy)
      gy += t.rowHeights[r] ?? 0
    }
    ctx.stroke()
  }
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save()
  ctx.fillStyle = 'rgba(120,130,145,0.12)'
  ctx.strokeStyle = 'rgba(120,130,145,0.45)'
  ctx.setLineDash([6, 4])
  ctx.lineWidth = 1
  ctx.fillRect(x, y, w, h)
  ctx.strokeRect(x, y, w, h)
  ctx.restore()
}

export function drawObject(ctx: CanvasRenderingContext2D, o: BoardObject, rc: RenderContext): void {
  const measure = rc.measure ?? canvasMeasure
  ctx.save()
  switch (o.type) {
    case 'stroke':
      drawStroke(ctx, o, !rc.darkPage)
      break
    case 'shape':
      drawShape(ctx, o)
      break
    case 'line':
      drawLine(ctx, o)
      break
    case 'polygon': {
      if (o.points.length < 4) break
      const p = new Path2D()
      p.moveTo(o.points[0], o.points[1])
      for (let i = 2; i < o.points.length; i += 2) p.lineTo(o.points[i], o.points[i + 1])
      if (o.closed) p.closePath()
      if (o.fill && o.closed) {
        ctx.fillStyle = o.fill
        ctx.fill(p)
      }
      if (o.strokeWidth > 0) {
        applyStrokeStyle(ctx, o.stroke, o.strokeWidth, o.dash)
        ctx.stroke(p)
      }
      break
    }
    case 'text':
      drawText(ctx, o, measure)
      break
    case 'math': {
      const img = rc.resources.mathImage(o)
      if (img) ctx.drawImage(img, o.x, o.y, o.w, o.h)
      else drawPlaceholder(ctx, o.x, o.y, o.w, o.h)
      break
    }
    case 'image': {
      const img = rc.resources.assetImage(rc.doc.assets[o.assetId])
      ctx.globalAlpha = o.opacity
      if (img) ctx.drawImage(img, o.x, o.y, o.w, o.h)
      else drawPlaceholder(ctx, o.x, o.y, o.w, o.h)
      break
    }
    case 'table':
      drawTable(ctx, o, measure)
      break
  }
  ctx.restore()
}

/**
 * Renders a page into a new canvas at `scale` device pixels per page pixel.
 * Export output therefore never depends on the editor's zoom.
 */
export function renderPageToCanvas(page: Page, rc: RenderContext, scale: number, background = true): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(page.width * scale))
  canvas.height = Math.max(1, Math.round(page.height * scale))
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  if (background) renderPage(ctx, page, rc)
  else for (const o of page.objects) drawObject(ctx, o, rc)
  return canvas
}
