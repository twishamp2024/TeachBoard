import { mathjax } from 'mathjax-full/js/mathjax.js'
import { TeX } from 'mathjax-full/js/input/tex.js'
import { SVG } from 'mathjax-full/js/output/svg.js'
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js'

/**
 * Offline LaTeX → SVG conversion. MathJax runs with its "lite" DOM adaptor so
 * it works identically in the renderer and in Node-based tests. The output is
 * a self-contained SVG (no font cache references) that can be drawn onto a
 * canvas, exported, and printed.
 */

const adaptor = liteAdaptor()
RegisterHTMLHandler(adaptor)

const packages = AllPackages.filter((p: string) => !['autoload', 'require', 'bussproofs', 'noerrors', 'noundefined'].includes(p))

const texInput = new TeX({
  packages,
  formatError: (_jax: unknown, err: Error) => {
    throw err
  }
})
const svgOutput = new SVG({ fontCache: 'none' })
const mjDocument = mathjax.document('', { InputJax: texInput, OutputJax: svgOutput })

/** MathJax lays out with 1em = 16px and 1ex = 8px; we scale by fontSize/2 per ex. */
const EX_PER_EM = 2

export interface MathRender {
  svg: string
  /** Size in page pixels for the given font size. */
  width: number
  height: number
}

export class MathError extends Error {}

/**
 * Turns the editor's multi-line input into a single TeX expression. Lines
 * containing `&` are aligned; otherwise they are centred.
 */
export function prepareLatex(source: string): string {
  // Control characters crash the TeX parser; strip them (keeping newlines and tabs).
  // eslint-disable-next-line no-control-regex
  const text = source.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim()
  if (!text.includes('\n') || /\\begin\{/.test(text)) return text
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length <= 1) return lines[0] ?? ''
  const env = lines.some((l) => l.includes('&')) ? 'aligned' : 'gathered'
  return `\\begin{${env}}${lines.join(' \\\\ ')}\\end{${env}}`
}

function escapeAttr(s: string): string {
  return s.replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c]!)
}

export function renderMath(source: string, color: string, fontSize: number): MathRender {
  const latex = prepareLatex(source)
  if (!latex) throw new MathError('Enter an expression')
  let node: unknown
  try {
    node = mjDocument.convert(latex, { display: true, em: 16, ex: 8, containerWidth: 1280 })
  } catch (err) {
    throw new MathError(err instanceof Error ? err.message : String(err))
  }
  let svg = adaptor.innerHTML(node as never) as string
  const wMatch = /width="([\d.]+)ex"/.exec(svg)
  const hMatch = /height="([\d.]+)ex"/.exec(svg)
  if (!wMatch || !hMatch) throw new MathError('Could not lay out the expression')
  const pxPerEx = fontSize / EX_PER_EM
  const width = Math.max(1, parseFloat(wMatch[1]) * pxPerEx)
  const height = Math.max(1, parseFloat(hMatch[1]) * pxPerEx)
  // Fix the intrinsic pixel size and colour so the SVG renders standalone.
  svg = svg
    .replace(/width="[\d.]+ex"/, `width="${width.toFixed(2)}"`)
    .replace(/height="[\d.]+ex"/, `height="${height.toFixed(2)}"`)
    .replace(/style="[^"]*"/, '')
    .replace('<svg ', `<svg color="${escapeAttr(color)}" style="color:${escapeAttr(color)}" `)
  if (!svg.includes('xmlns="http://www.w3.org/2000/svg"')) {
    svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
  }
  // MathJax uses currentColor; make it explicit for image rendering.
  svg = svg.replace(/currentColor/g, escapeAttr(color))
  return { svg, width, height }
}

/** Ready-made expressions offered by the equation editor. */
export const MATH_TEMPLATES: { label: string; latex: string }[] = [
  { label: 'Quadratic formula', latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
  { label: 'Pythagorean theorem', latex: 'a^2 + b^2 = c^2' },
  { label: 'Area of a circle', latex: 'A = \\pi r^2' },
  { label: 'Slope', latex: 'm = \\frac{y_2 - y_1}{x_2 - x_1}' },
  { label: 'Distance formula', latex: 'd = \\sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}' },
  { label: 'Newton’s second law', latex: '\\vec{F} = m\\vec{a}' },
  { label: 'Kinetic energy', latex: 'E_k = \\frac{1}{2} m v^2' },
  { label: 'Ohm’s law', latex: 'V = I R' },
  { label: 'Mass–energy', latex: 'E = mc^2' },
  { label: 'Sum of series', latex: '\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}' },
  { label: 'Definite integral', latex: '\\int_{a}^{b} f(x)\\,dx = F(b) - F(a)' },
  { label: 'Derivative', latex: "f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}" },
  { label: 'System of equations', latex: '\\left\\{\\begin{aligned} 2x + y &= 7 \\\\ x - y &= 2 \\end{aligned}\\right.' },
  { label: '2×2 matrix', latex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
  { label: 'Solving steps', latex: '2x + 3 &= 11\n2x &= 8\nx &= 4' },
  { label: 'Trig identity', latex: '\\sin^2\\theta + \\cos^2\\theta = 1' },
  { label: 'Logarithm rule', latex: '\\log_b(xy) = \\log_b x + \\log_b y' },
  { label: 'Chemical equation', latex: '2\\mathrm{H_2} + \\mathrm{O_2} \\rightarrow 2\\mathrm{H_2O}' }
]

export interface SymbolButton {
  label: string
  insert: string
  /** Where to place the caret, as an offset from the start of `insert`. */
  caret?: number
  title: string
}

export const MATH_SYMBOL_GROUPS: { name: string; items: SymbolButton[] }[] = [
  {
    name: 'Structures',
    items: [
      { label: 'a/b', insert: '\\frac{}{}', caret: 6, title: 'Fraction' },
      { label: 'x²', insert: '^{}', caret: 2, title: 'Superscript / exponent' },
      { label: 'x₂', insert: '_{}', caret: 2, title: 'Subscript' },
      { label: '√', insert: '\\sqrt{}', caret: 6, title: 'Square root' },
      { label: 'ⁿ√', insert: '\\sqrt[]{}', caret: 6, title: 'nth root' },
      { label: '( )', insert: '\\left(  \\right)', caret: 7, title: 'Brackets that grow' },
      { label: '|x|', insert: '\\left|  \\right|', caret: 7, title: 'Absolute value' },
      { label: 'x̄', insert: '\\overline{}', caret: 10, title: 'Overline' },
      { label: 'vec', insert: '\\vec{}', caret: 5, title: 'Vector arrow' },
      { label: 'Σ', insert: '\\sum_{i=1}^{n} ', title: 'Summation' },
      { label: '∫', insert: '\\int_{a}^{b} ', title: 'Integral' },
      { label: 'lim', insert: '\\lim_{x \\to } ', caret: 12, title: 'Limit' },
      { label: '[ ]', insert: '\\begin{bmatrix}  &  \\\\  &  \\end{bmatrix}', caret: 15, title: 'Matrix' },
      { label: 'text', insert: '\\text{}', caret: 6, title: 'Plain text' }
    ]
  },
  {
    name: 'Operators',
    items: [
      { label: '±', insert: '\\pm ', title: 'Plus or minus' },
      { label: '×', insert: '\\times ', title: 'Times' },
      { label: '÷', insert: '\\div ', title: 'Divide' },
      { label: '·', insert: '\\cdot ', title: 'Dot' },
      { label: '≠', insert: '\\neq ', title: 'Not equal' },
      { label: '≈', insert: '\\approx ', title: 'Approximately' },
      { label: '≤', insert: '\\leq ', title: 'Less or equal' },
      { label: '≥', insert: '\\geq ', title: 'Greater or equal' },
      { label: '∞', insert: '\\infty ', title: 'Infinity' },
      { label: '→', insert: '\\rightarrow ', title: 'Arrow' },
      { label: '⇒', insert: '\\Rightarrow ', title: 'Implies' },
      { label: '∠', insert: '\\angle ', title: 'Angle' },
      { label: '°', insert: '^{\\circ}', title: 'Degrees' },
      { label: '∥', insert: '\\parallel ', title: 'Parallel' },
      { label: '⊥', insert: '\\perp ', title: 'Perpendicular' },
      { label: '∈', insert: '\\in ', title: 'Element of' },
      { label: '∪', insert: '\\cup ', title: 'Union' },
      { label: '∩', insert: '\\cap ', title: 'Intersection' },
      { label: '∂', insert: '\\partial ', title: 'Partial' },
      { label: '∴', insert: '\\therefore ', title: 'Therefore' }
    ]
  },
  {
    name: 'Greek',
    items: [
      ['α', 'alpha'],
      ['β', 'beta'],
      ['γ', 'gamma'],
      ['δ', 'delta'],
      ['Δ', 'Delta'],
      ['ε', 'epsilon'],
      ['θ', 'theta'],
      ['λ', 'lambda'],
      ['μ', 'mu'],
      ['π', 'pi'],
      ['ρ', 'rho'],
      ['σ', 'sigma'],
      ['Σ', 'Sigma'],
      ['τ', 'tau'],
      ['φ', 'phi'],
      ['ω', 'omega'],
      ['Ω', 'Omega']
    ].map(([label, name]) => ({ label, insert: `\\${name} `, title: name }))
  },
  {
    name: 'Functions',
    items: ['sin', 'cos', 'tan', 'log', 'ln', 'exp'].map((f) => ({ label: f, insert: `\\${f} `, title: f }))
  }
]
