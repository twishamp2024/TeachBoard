import type { TextObject } from './model'

/**
 * Text layout shared by the canvas renderer, the inline editor and exports.
 * Measurement is injected so layout is testable without a canvas.
 */
export type MeasureFn = (font: string, text: string) => number

export const LINE_HEIGHT = 1.3
export const TEXT_PADDING = 4

export interface FontOption {
  family: string
  label: string
  css: string
}

/** Fonts bundled with the application so lessons look the same on every OS. */
export const FONT_OPTIONS: FontOption[] = [
  { family: 'Atkinson Hyperlegible', label: 'Atkinson Hyperlegible', css: '"Atkinson Hyperlegible", sans-serif' },
  { family: 'Inter', label: 'Inter', css: 'Inter, sans-serif' },
  { family: 'Merriweather', label: 'Merriweather (serif)', css: 'Merriweather, serif' },
  { family: 'Patrick Hand', label: 'Patrick Hand (handwriting)', css: '"Patrick Hand", cursive' },
  { family: 'JetBrains Mono', label: 'JetBrains Mono (code)', css: '"JetBrains Mono", monospace' }
]

export function fontCss(family: string): string {
  return FONT_OPTIONS.find((f) => f.family === family)?.css ?? `"${family.replace(/"/g, '')}", sans-serif`
}

export function fontString(o: Pick<TextObject, 'fontFamily' | 'fontSize' | 'bold' | 'italic'>): string {
  return `${o.italic ? 'italic ' : ''}${o.bold ? '700' : '400'} ${o.fontSize}px ${fontCss(o.fontFamily)}`
}

/** Wraps text into lines that fit `maxWidth`, honouring explicit newlines. */
export function wrapText(text: string, font: string, maxWidth: number, measure: MeasureFn): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    if (para === '') {
      out.push('')
      continue
    }
    const words = para.split(/(\s+)/)
    let line = ''
    // Words longer than a whole line are broken across lines.
    const breakLong = () => {
      while (line && measure(font, line) > maxWidth && line.length > 1) {
        let cut = line.length - 1
        while (cut > 1 && measure(font, line.slice(0, cut)) > maxWidth) cut--
        out.push(line.slice(0, cut))
        line = line.slice(cut)
      }
    }
    for (const word of words) {
      const candidate = line + word
      if (line === '' || measure(font, candidate.trimEnd()) <= maxWidth) {
        line = candidate
        breakLong()
        continue
      }
      out.push(line.trimEnd())
      line = word.trimStart()
      breakLong()
    }
    out.push(line.trimEnd())
  }
  return out
}

export function layoutText(o: TextObject, measure: MeasureFn): { lines: string[]; height: number } {
  const lines = wrapText(o.text, fontString(o), Math.max(1, o.w - TEXT_PADDING * 2), measure)
  const height = Math.max(1, lines.length) * o.fontSize * LINE_HEIGHT + TEXT_PADDING * 2
  return { lines, height }
}

/** A rough measure used where no canvas exists (tests, worker contexts). */
export const approximateMeasure: MeasureFn = (font, text) => {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16)
  return text.length * size * 0.52
}

let measureCtx: CanvasRenderingContext2D | null = null

/** Canvas-backed text measurement for the renderer. */
export const canvasMeasure: MeasureFn = (font, text) => {
  if (!measureCtx) {
    if (typeof document === 'undefined') return approximateMeasure(font, text)
    measureCtx = document.createElement('canvas').getContext('2d')
    if (!measureCtx) return approximateMeasure(font, text)
  }
  if (measureCtx.font !== font) measureCtx.font = font
  return measureCtx.measureText(text).width
}

const metricsCache = new Map<string, { ascent: number; descent: number }>()

/**
 * Font ascent/descent as fractions of the font size. CSS centres this
 * content area inside each line box, so using the same metrics keeps canvas
 * text exactly where the inline editor showed it.
 */
export function fontMetrics(family: string, bold: boolean, italic: boolean): { ascent: number; descent: number } {
  const key = `${family}|${bold}|${italic}`
  const cached = metricsCache.get(key)
  if (cached) return cached
  let result = { ascent: 0.9, descent: 0.22 }
  if (typeof document !== 'undefined') {
    const ctx = document.createElement('canvas').getContext('2d')
    if (ctx) {
      ctx.font = fontString({ fontFamily: family, fontSize: 100, bold, italic })
      const m = ctx.measureText('Hg')
      if (m.fontBoundingBoxAscent) result = { ascent: m.fontBoundingBoxAscent / 100, descent: m.fontBoundingBoxDescent / 100 }
      // Only cache once the web font is actually available.
      if (document.fonts?.check(ctx.font)) metricsCache.set(key, result)
    }
  }
  return result
}

/** Baseline of the first line, relative to the text box top. */
export function firstBaselineOffset(o: Pick<TextObject, 'fontFamily' | 'fontSize' | 'bold' | 'italic'>): number {
  const { ascent, descent } = fontMetrics(o.fontFamily, o.bold, o.italic)
  const lh = o.fontSize * LINE_HEIGHT
  return TEXT_PADDING + (lh - (ascent + descent) * o.fontSize) / 2 + ascent * o.fontSize
}
