import { useState } from 'react'
import { evaluate, formatResult, type AngleMode } from '../../core/calculator'
import { insertTextAt } from '../../state/ops'
import { useUi } from '../../state/ui'
import { Button, cx, Segmented } from '../primitives'

const KEYS: (string | [string, string])[] = [
  ['sin', 'sin('],
  ['cos', 'cos('],
  ['tan', 'tan('],
  ['π', 'π'],
  ['√', '√('],
  ['x²', '^2'],
  ['xʸ', '^'],
  ['(', '('],
  [')', ')'],
  ['n!', '!'],
  '7',
  '8',
  '9',
  ['÷', '÷'],
  ['log', 'log('],
  '4',
  '5',
  '6',
  ['×', '×'],
  ['ln', 'ln('],
  '1',
  '2',
  '3',
  ['−', '−'],
  ['%', '%'],
  '0',
  '.',
  ['ans', 'ans'],
  ['+', '+'],
  ['=', '=']
]

export function CalculatorWidget() {
  const [expr, setExpr] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<AngleMode>('deg')
  const [ans, setAns] = useState('0')
  const [history, setHistory] = useState<{ expr: string; result: string }[]>([])

  const compute = () => {
    if (!expr.trim()) return
    try {
      const v = evaluate(expr.replace(/ans/g, `(${ans})`), mode)
      const r = formatResult(v)
      setResult(r)
      setError(null)
      setAns(r)
      setHistory((h) => [{ expr, result: r }, ...h].slice(0, 6))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
      setResult(null)
    }
  }

  const press = (k: string) => {
    if (k === '=') return compute()
    setExpr((e) => e + k)
    setError(null)
  }

  return (
    <div className="calc">
      <div className="calc__screen">
        <input
          className="calc__expr"
          value={expr}
          aria-label="Expression"
          placeholder="0"
          onChange={(e) => {
            setExpr(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') compute()
            if (e.key === 'Escape') {
              setExpr('')
              setResult(null)
            }
          }}
        />
        <div className={cx('calc__result', error && 'is-error')} aria-live="polite">
          {error ?? (result !== null ? `= ${result}` : ' ')}
        </div>
      </div>
      <div className="row">
        <Segmented
          label="Angle unit"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'deg', label: 'DEG' },
            { value: 'rad', label: 'RAD' }
          ]}
        />
        <span className="spacer" />
        <Button small variant="ghost" onClick={() => setExpr((e) => e.slice(0, -1))}>
          ⌫
        </Button>
        <Button
          small
          variant="ghost"
          onClick={() => {
            setExpr('')
            setResult(null)
            setError(null)
          }}
        >
          C
        </Button>
      </div>
      <div className="calc__keys">
        {KEYS.map((k) => {
          const [label, ins] = typeof k === 'string' ? [k, k] : k
          return (
            <button key={label} type="button" className={cx('calc__key', /^[0-9.]$/.test(label) && 'is-digit', label === '=' && 'is-equals')} onClick={() => press(ins)}>
              {label}
            </button>
          )
        })}
      </div>
      <Button
        small
        disabled={result === null}
        onClick={() => {
          if (result === null) return
          insertTextAt(`${expr} = ${result}`)
          useUi.getState().setTool('select')
        }}
      >
        Place result on page
      </Button>
      {history.length > 0 && (
        <ul className="calc__history">
          {history.map((h, i) => (
            <li key={i}>
              <button type="button" onClick={() => setExpr(h.expr)}>
                {h.expr} = <strong>{h.result}</strong>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
