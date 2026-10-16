import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { CalcError, evaluate, formatResult } from '../../src/renderer/src/core/calculator'
import { isDarkColor, luminance, normalizeHex } from '../../src/renderer/src/core/color'
import { buildPdf, PX_TO_PT, safeFileName } from '../../src/renderer/src/core/exporter'
import { MathError, prepareLatex, renderMath } from '../../src/renderer/src/core/math'
import { approximateMeasure, wrapText } from '../../src/renderer/src/core/text'
import { fitPage, nextZoomStep, pageToScreen, screenToPage, zoomAt } from '../../src/renderer/src/core/viewport'
import { defaultSettings, sanitizeSettings } from '../../src/renderer/src/state/settings'

// A valid 1×1 PNG.
const PNG_1PX = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0)
)

describe('calculator', () => {
  it('respects precedence, associativity and implicit multiplication', () => {
    expect(evaluate('2+3*4')).toBe(14)
    expect(evaluate('(2+3)*4')).toBe(20)
    expect(evaluate('2^3^2')).toBe(512)
    expect(evaluate('-2^2')).toBe(-4)
    expect(evaluate('2π')).toBeCloseTo(2 * Math.PI)
    expect(evaluate('3(4)')).toBe(12)
    expect(evaluate('5!')).toBe(120)
    expect(evaluate('10 % 4')).toBe(2)
    expect(evaluate('6 ÷ 3 × 2 − 1')).toBe(3)
  })

  it('handles functions in degrees and radians', () => {
    expect(evaluate('sin(30)', 'deg')).toBeCloseTo(0.5)
    expect(evaluate('cos(90)', 'deg')).toBe(0)
    expect(evaluate('sin(pi/2)', 'rad')).toBe(1)
    expect(evaluate('sqrt(16)+log(1000)+ln(e)')).toBe(8)
    expect(evaluate('root(27,3)')).toBeCloseTo(3)
  })

  it('reports errors instead of producing nonsense', () => {
    expect(() => evaluate('1/0')).toThrow(CalcError)
    expect(() => evaluate('sqrt(-1)')).toThrow(CalcError)
    expect(() => evaluate('2+')).toThrow(CalcError)
    expect(() => evaluate('alert(1)')).toThrow(CalcError)
    expect(() => evaluate('tan(90)', 'deg')).toThrow(CalcError)
  })

  it('formats results', () => {
    expect(formatResult(0.1 + 0.2)).toBe('0.3')
    expect(formatResult(42)).toBe('42')
  })
})

describe('math notation', () => {
  it('renders fractions, exponents, roots and symbols to standalone SVG', () => {
    const r = renderMath('\\frac{a}{b} + x^{2} + \\sqrt[3]{y} + \\alpha \\leq \\pi', '#D93B3B', 40)
    expect(r.svg).toContain('<svg')
    expect(r.svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(r.svg).toContain('#D93B3B')
    expect(r.svg).not.toContain('currentColor')
    expect(r.width).toBeGreaterThan(50)
    expect(r.height).toBeGreaterThan(20)
  })

  it('scales with the font size', () => {
    const a = renderMath('x^2', '#000', 20)
    const b = renderMath('x^2', '#000', 40)
    expect(b.width).toBeCloseTo(a.width * 2, 3)
  })

  it('turns multiple lines into aligned or gathered rows', () => {
    expect(prepareLatex('2x &= 8\nx &= 4')).toBe('\\begin{aligned}2x &= 8 \\\\ x &= 4\\end{aligned}')
    expect(prepareLatex('a\nb')).toBe('\\begin{gathered}a \\\\ b\\end{gathered}')
    expect(renderMath('2x &= 8\nx &= 4', '#000', 40).height).toBeGreaterThan(renderMath('x = 4', '#000', 40).height * 1.5)
  })

  it('reports TeX errors', () => {
    expect(() => renderMath('\\frac{a', '#000', 40)).toThrow(MathError)
    expect(() => renderMath('\\notacommand{x}', '#000', 40)).toThrow(MathError)
    expect(() => renderMath('   ', '#000', 40)).toThrow(MathError)
  })

  it('strips control characters that would crash the parser', () => {
    expect(prepareLatex('x\u000c+1')).toBe('x+1')
  })
})

describe('viewport transforms', () => {
  it('round-trips page and screen coordinates', () => {
    const v = { zoom: 1.75, panX: -120, panY: 40 }
    const s = pageToScreen(v, 300, 200)
    const p = screenToPage(v, s.x, s.y)
    expect(p.x).toBeCloseTo(300)
    expect(p.y).toBeCloseTo(200)
  })

  it('keeps the anchor point fixed while zooming', () => {
    const v = { zoom: 1, panX: 10, panY: 20 }
    const before = screenToPage(v, 400, 300)
    const after = screenToPage(zoomAt(v, 3, 400, 300), 400, 300)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('fits and centres pages and steps through zoom levels', () => {
    const v = fitPage(1000, 600, 1920, 1080, 0)
    expect(v.zoom).toBeCloseTo(1000 / 1920)
    expect(v.panY).toBeCloseTo((600 - 1080 * v.zoom) / 2)
    expect(nextZoomStep(1, 1)).toBe(1.25)
    expect(nextZoomStep(1, -1)).toBe(0.9)
  })
})

describe('PDF export', () => {
  it('creates one sheet per page at the page size, independent of zoom', async () => {
    const pdfBytes = await buildPdf(
      [
        { bytes: PNG_1PX, kind: 'png', width: 1920, height: 1080 },
        { bytes: PNG_1PX, kind: 'png', width: 1240, height: 1754 }
      ],
      { title: 'Lesson', producer: 'Test' }
    )
    const pdf = await PDFDocument.load(pdfBytes)
    expect(pdf.getPageCount()).toBe(2)
    expect(pdf.getPage(0).getSize()).toEqual({ width: 1920 * PX_TO_PT, height: 1080 * PX_TO_PT })
    expect(pdf.getPage(1).getSize()).toEqual({ width: 1240 * PX_TO_PT, height: 1754 * PX_TO_PT })
    expect(pdf.getTitle()).toBe('Lesson')
  })

  it('makes safe file names', () => {
    expect(safeFileName('a/b:c*?"<>|d')).toBe('a b c d')
    expect(safeFileName('   ')).toBe('Lesson')
  })
})

describe('text layout', () => {
  it('wraps on word boundaries, honours newlines and breaks long words', () => {
    const font = '400 10px Inter'
    const lines = wrapText('one two three four\nfive', font, 60, approximateMeasure)
    expect(lines).toEqual(['one two', 'three four', 'five'])
    const long = wrapText('abcdefghijklmnopqrstuvwxyz', font, 52, approximateMeasure)
    expect(long.length).toBeGreaterThan(1)
    expect(long.join('')).toBe('abcdefghijklmnopqrstuvwxyz')
  })
})

describe('colours', () => {
  it('computes luminance and darkness', () => {
    expect(luminance('#FFFFFF')).toBeCloseTo(1)
    expect(isDarkColor('#21463A')).toBe(true)
    expect(isDarkColor('#FFF4D6')).toBe(false)
    expect(normalizeHex('#abc')).toBe('#AABBCC')
  })
})

describe('settings validation', () => {
  it('falls back to defaults for missing or corrupt settings', () => {
    expect(sanitizeSettings(null)).toEqual(defaultSettings())
    expect(sanitizeSettings('garbage')).toEqual(defaultSettings())
  })

  it('keeps valid values and repairs invalid ones field by field', () => {
    const s = sanitizeSettings({
      theme: 'dark',
      drawing: { pen: { color: 'not-a-colour', width: 999, style: 'pen' }, eraser: { mode: 'object' } },
      toolbar: { items: ['pen', 'bogus', 'select'], position: 'left' },
      shortcuts: { 'tool.pen': ['B'], broken: 'x' },
      palette: ['#000000']
    })
    expect(s.theme).toBe('dark')
    expect(s.drawing.pen.color).toBe(defaultSettings().drawing.pen.color)
    expect(s.drawing.pen.width).toBe(60)
    expect(s.drawing.eraser.mode).toBe('object')
    expect(s.toolbar).toEqual({ items: ['pen', 'select'], position: 'left' })
    expect(s.shortcuts).toEqual({ 'tool.pen': ['B'] })
    expect(s.palette).toEqual(defaultSettings().palette)
  })
})
