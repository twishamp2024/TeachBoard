/**
 * A small, safe expression evaluator for the calculator tool (no `eval`).
 * Supports + − × ÷ ^ %, parentheses, unary minus, implicit multiplication,
 * constants π and e, factorial, and common functions.
 */

export type AngleMode = 'deg' | 'rad'

type Token =
  | { t: 'num'; v: number }
  | { t: 'op'; v: string }
  | { t: 'fn'; v: string }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'comma' }

const FUNCTIONS = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'cbrt', 'log', 'ln', 'abs', 'exp', 'round', 'floor', 'ceil', 'root']

export class CalcError extends Error {}

function tokenize(src: string): Token[] {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/√/g, 'sqrt').replace(/π/g, 'pi')
  const out: Token[] = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < s.length && /[0-9.]/.test(s[j])) j++
      if (j < s.length && /[eE]/.test(s[j]) && /[-+0-9]/.test(s[j + 1] ?? '')) {
        j++
        if (/[-+]/.test(s[j])) j++
        while (j < s.length && /[0-9]/.test(s[j])) j++
      }
      const v = Number(s.slice(i, j))
      if (!Number.isFinite(v)) throw new CalcError('Invalid number')
      out.push({ t: 'num', v })
      i = j
      continue
    }
    if (/[a-z]/i.test(c)) {
      let j = i
      while (j < s.length && /[a-z]/i.test(s[j])) j++
      const word = s.slice(i, j).toLowerCase()
      if (word === 'pi') out.push({ t: 'num', v: Math.PI })
      else if (word === 'e') out.push({ t: 'num', v: Math.E })
      else if (FUNCTIONS.includes(word)) out.push({ t: 'fn', v: word })
      else throw new CalcError(`Unknown name “${word}”`)
      i = j
      continue
    }
    if ('+-*/^%!'.includes(c)) out.push({ t: 'op', v: c })
    else if (c === '(') out.push({ t: 'lp' })
    else if (c === ')') out.push({ t: 'rp' })
    else if (c === ',') out.push({ t: 'comma' })
    else throw new CalcError(`Unexpected “${c}”`)
    i++
  }
  // Implicit multiplication: 2pi, 2(3), (1)(2), 3sqrt(4)
  const res: Token[] = []
  for (let k = 0; k < out.length; k++) {
    const prev = res[res.length - 1]
    const cur = out[k]
    const prevEnds = prev && (prev.t === 'num' || prev.t === 'rp' || (prev.t === 'op' && prev.v === '!'))
    const curStarts = cur.t === 'num' || cur.t === 'lp' || cur.t === 'fn'
    if (prevEnds && curStarts) res.push({ t: 'op', v: '*' })
    res.push(cur)
  }
  return res
}

class Parser {
  private i = 0
  constructor(
    private tokens: Token[],
    private mode: AngleMode
  ) {}

  parse(): number {
    if (!this.tokens.length) throw new CalcError('Empty expression')
    const v = this.expr()
    if (this.i < this.tokens.length) throw new CalcError('Unexpected input')
    return v
  }

  private peek(): Token | undefined {
    return this.tokens[this.i]
  }

  private expr(): number {
    let v = this.term()
    for (;;) {
      const t = this.peek()
      if (t?.t === 'op' && (t.v === '+' || t.v === '-')) {
        this.i++
        const r = this.term()
        v = t.v === '+' ? v + r : v - r
      } else return v
    }
  }

  private term(): number {
    let v = this.unary()
    for (;;) {
      const t = this.peek()
      if (t?.t === 'op' && (t.v === '*' || t.v === '/' || t.v === '%')) {
        this.i++
        const r = this.unary()
        if (t.v === '*') v *= r
        else if (t.v === '/') {
          if (r === 0) throw new CalcError('Cannot divide by zero')
          v /= r
        } else v = v % r
      } else return v
    }
  }

  private unary(): number {
    const t = this.peek()
    if (t?.t === 'op' && (t.v === '-' || t.v === '+')) {
      this.i++
      const v = this.unary()
      return t.v === '-' ? -v : v
    }
    return this.power()
  }

  private power(): number {
    const base = this.postfix()
    const t = this.peek()
    if (t?.t === 'op' && t.v === '^') {
      this.i++
      const exp = this.unary() // right-associative
      return Math.pow(base, exp)
    }
    return base
  }

  private postfix(): number {
    let v = this.primary()
    while (this.peek()?.t === 'op' && (this.peek() as { v: string }).v === '!') {
      this.i++
      if (v < 0 || !Number.isInteger(v) || v > 170) throw new CalcError('Factorial needs a whole number 0–170')
      let f = 1
      for (let k = 2; k <= v; k++) f *= k
      v = f
    }
    return v
  }

  private primary(): number {
    const t = this.tokens[this.i++]
    if (!t) throw new CalcError('Incomplete expression')
    if (t.t === 'num') return t.v
    if (t.t === 'lp') {
      const v = this.expr()
      if (this.tokens[this.i++]?.t !== 'rp') throw new CalcError('Missing “)”')
      return v
    }
    if (t.t === 'fn') {
      if (this.tokens[this.i++]?.t !== 'lp') throw new CalcError(`${t.v} needs parentheses`)
      const args = [this.expr()]
      while (this.peek()?.t === 'comma') {
        this.i++
        args.push(this.expr())
      }
      if (this.tokens[this.i++]?.t !== 'rp') throw new CalcError('Missing “)”')
      return this.apply(t.v, args)
    }
    throw new CalcError('Unexpected operator')
  }

  private apply(fn: string, args: number[]): number {
    const a = args[0]
    const toRad = (x: number) => (this.mode === 'deg' ? (x * Math.PI) / 180 : x)
    const fromRad = (x: number) => (this.mode === 'deg' ? (x * 180) / Math.PI : x)
    switch (fn) {
      case 'sin':
        return cleanTrig(Math.sin(toRad(a)))
      case 'cos':
        return cleanTrig(Math.cos(toRad(a)))
      case 'tan': {
        const c = cleanTrig(Math.cos(toRad(a)))
        if (c === 0) throw new CalcError('tan is undefined here')
        return cleanTrig(Math.sin(toRad(a))) / c
      }
      case 'asin':
        return fromRad(Math.asin(a))
      case 'acos':
        return fromRad(Math.acos(a))
      case 'atan':
        return fromRad(Math.atan(a))
      case 'sqrt':
        if (a < 0) throw new CalcError('Square root of a negative number')
        return Math.sqrt(a)
      case 'cbrt':
        return Math.cbrt(a)
      case 'root': {
        const n = args[1] ?? 2
        if (a < 0 && n % 2 === 0) throw new CalcError('Even root of a negative number')
        return a < 0 ? -Math.pow(-a, 1 / n) : Math.pow(a, 1 / n)
      }
      case 'log':
        if (a <= 0) throw new CalcError('log needs a positive number')
        return Math.log10(a)
      case 'ln':
        if (a <= 0) throw new CalcError('ln needs a positive number')
        return Math.log(a)
      case 'abs':
        return Math.abs(a)
      case 'exp':
        return Math.exp(a)
      case 'round':
        return Math.round(a)
      case 'floor':
        return Math.floor(a)
      case 'ceil':
        return Math.ceil(a)
      default:
        throw new CalcError(`Unknown function ${fn}`)
    }
  }
}

function cleanTrig(v: number): number {
  return Math.abs(v) < 1e-12 ? 0 : Math.abs(v - Math.round(v)) < 1e-12 ? Math.round(v) : v
}

export function evaluate(expression: string, mode: AngleMode = 'deg'): number {
  const v = new Parser(tokenize(expression), mode).parse()
  if (!Number.isFinite(v)) throw new CalcError('Result is not a finite number')
  return v
}

export function formatResult(v: number): string {
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v)
  const s = Number(v.toPrecision(12)).toString()
  return s
}
