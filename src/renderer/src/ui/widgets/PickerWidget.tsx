import { useEffect, useRef, useState } from 'react'
import { Shuffle } from 'lucide-react'
import { api } from '../../platform'
import { Button } from '../primitives'

/** Picks a random name (or anything else) from a list. The list is remembered between sessions. */
export function PickerWidget() {
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [rolling, setRolling] = useState(false)
  const [removePicked, setRemovePicked] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    api
      .readStore('ui')
      .then((raw) => {
        const names = (raw as { pickerNames?: unknown } | null)?.pickerNames
        if (typeof names === 'string') setText(names)
      })
      .finally(() => setLoaded(true))
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [])

  useEffect(() => {
    if (!loaded) return
    const t = setTimeout(() => {
      void api.readStore('ui').then((raw) => api.writeStore('ui', { ...(raw && typeof raw === 'object' ? raw : {}), pickerNames: text.slice(0, 20000) }))
    }, 500)
    return () => clearTimeout(t)
  }, [text, loaded])

  const names = text
    .split('\n')
    .map((n) => n.trim())
    .filter(Boolean)

  const pick = () => {
    if (!names.length || rolling) return
    setRolling(true)
    let n = 0
    timer.current = setInterval(() => {
      setPicked(names[Math.floor(Math.random() * names.length)])
      if (++n >= 14) {
        clearInterval(timer.current!)
        const choice = names[Math.floor(Math.random() * names.length)]
        setPicked(choice)
        setRolling(false)
        if (removePicked) {
          const lines = text.split('\n')
          const i = lines.findIndex((l) => l.trim() === choice)
          if (i >= 0) {
            lines.splice(i, 1)
            setText(lines.join('\n'))
          }
        }
      }
    }, 70)
  }

  return (
    <div className="picker">
      <div className={rolling ? 'picker__result is-rolling' : 'picker__result'} aria-live="polite">
        {picked ?? '—'}
      </div>
      <Button variant="primary" onClick={pick} disabled={!names.length || rolling}>
        <Shuffle size={15} /> Pick
      </Button>
      <label className="field">
        <span className="field__label">Names or items (one per line) · {names.length}</span>
        <textarea className="input" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Ada\nGrace\nAlan'} />
      </label>
      <label className="check">
        <input type="checkbox" checked={removePicked} onChange={(e) => setRemovePicked(e.target.checked)} />
        Remove each pick from the list
      </label>
    </div>
  )
}
