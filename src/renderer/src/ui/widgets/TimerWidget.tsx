import { useEffect, useRef, useState } from 'react'
import { Flag, Pause, Play, RotateCcw } from 'lucide-react'
import { Button, cx, Segmented } from '../primitives'

function fmt(ms: number, tenths = false): string {
  const total = Math.max(0, ms)
  const m = Math.floor(total / 60000)
  const s = Math.floor((total % 60000) / 1000)
  const t = Math.floor((total % 1000) / 100)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${tenths ? `.${t}` : ''}`
}

/** A short, offline chime made with Web Audio. */
function chime(): void {
  try {
    const ctx = new AudioContext()
    const notes = [880, 660, 880, 660, 1046]
    notes.forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = f
      const t = ctx.currentTime + i * 0.22
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 0.22)
    })
    setTimeout(() => void ctx.close(), 2000)
  } catch {
    // Audio is optional.
  }
}

function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!active) return
    let f = 0
    const loop = () => {
      setNow(performance.now())
      f = requestAnimationFrame(loop)
    }
    f = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(f)
  }, [active])
  return now
}

function Countdown() {
  const [duration, setDuration] = useState(5 * 60000)
  const [endAt, setEndAt] = useState<number | null>(null)
  const [pausedLeft, setPausedLeft] = useState<number | null>(null)
  const [done, setDone] = useState(false)
  const now = useTicker(endAt !== null)
  const left = endAt !== null ? endAt - now : pausedLeft ?? duration
  const fired = useRef(false)

  useEffect(() => {
    if (endAt !== null && left <= 0 && !fired.current) {
      fired.current = true
      setEndAt(null)
      setPausedLeft(0)
      setDone(true)
      chime()
    }
  }, [left, endAt])

  const start = () => {
    fired.current = false
    setDone(false)
    setEndAt(performance.now() + (pausedLeft && pausedLeft > 0 ? pausedLeft : duration))
    setPausedLeft(null)
  }
  const pause = () => {
    if (endAt === null) return
    setPausedLeft(endAt - performance.now())
    setEndAt(null)
  }
  const reset = () => {
    setEndAt(null)
    setPausedLeft(null)
    setDone(false)
  }
  const setMinutes = (m: number) => {
    reset()
    setDuration(Math.max(1000, Math.min(180 * 60000, m * 60000)))
  }
  const progress = Math.max(0, Math.min(1, left / duration))
  const R = 70
  const C = 2 * Math.PI * R
  return (
    <div className={cx('timer', done && 'is-done')}>
      <div className="timer__dial">
        <svg width="170" height="170" viewBox="0 0 170 170" aria-hidden="true">
          <circle cx="85" cy="85" r={R} className="timer__track" />
          <circle cx="85" cy="85" r={R} className="timer__progress" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} transform="rotate(-90 85 85)" />
        </svg>
        <div className="timer__time" role="timer" aria-live="off">
          {fmt(left)}
        </div>
      </div>
      {done && <div className="timer__done" role="alert">Time’s up!</div>}
      <div className="chip-row chip-row--center">
        {[1, 2, 3, 5, 10, 15].map((m) => (
          <button key={m} type="button" className={cx('chip', duration === m * 60000 && 'is-active')} onClick={() => setMinutes(m)}>
            {m} min
          </button>
        ))}
      </div>
      <div className="timer__adjust">
        <label>
          Minutes
          <input className="num-input" type="number" min={0} max={180} value={Math.floor(duration / 60000)} onChange={(e) => { reset(); setDuration(Math.max(1000, (Number(e.target.value) || 0) * 60000 + (duration % 60000))) }} />
        </label>
        <label>
          Seconds
          <input className="num-input" type="number" min={0} max={59} value={Math.floor((duration % 60000) / 1000)} onChange={(e) => { reset(); setDuration(Math.max(1000, Math.floor(duration / 60000) * 60000 + Math.min(59, Number(e.target.value) || 0) * 1000)) }} />
        </label>
      </div>
      <div className="row row--center">
        {endAt === null ? (
          <Button variant="primary" onClick={start}>
            <Play size={15} /> {pausedLeft && pausedLeft > 0 ? 'Resume' : 'Start'}
          </Button>
        ) : (
          <Button variant="primary" onClick={pause}>
            <Pause size={15} /> Pause
          </Button>
        )}
        <Button onClick={reset}>
          <RotateCcw size={15} /> Reset
        </Button>
      </div>
    </div>
  )
}

function Stopwatch() {
  const [startAt, setStartAt] = useState<number | null>(null)
  const [acc, setAcc] = useState(0)
  const [laps, setLaps] = useState<number[]>([])
  const now = useTicker(startAt !== null)
  const elapsed = acc + (startAt !== null ? now - startAt : 0)
  return (
    <div className="timer">
      <div className="timer__time timer__time--big" role="timer">
        {fmt(elapsed, true)}
      </div>
      <div className="row row--center">
        {startAt === null ? (
          <Button variant="primary" onClick={() => setStartAt(performance.now())}>
            <Play size={15} /> {acc ? 'Resume' : 'Start'}
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => {
              setAcc(acc + performance.now() - startAt)
              setStartAt(null)
            }}
          >
            <Pause size={15} /> Stop
          </Button>
        )}
        <Button onClick={() => setLaps([elapsed, ...laps])} disabled={startAt === null}>
          <Flag size={15} /> Lap
        </Button>
        <Button
          onClick={() => {
            setStartAt(null)
            setAcc(0)
            setLaps([])
          }}
        >
          <RotateCcw size={15} /> Reset
        </Button>
      </div>
      {laps.length > 0 && (
        <ol className="laps" reversed>
          {laps.map((l, i) => (
            <li key={i}>{fmt(l, true)}</li>
          ))}
        </ol>
      )}
    </div>
  )
}

export function TimerWidget() {
  const [mode, setMode] = useState<'timer' | 'stopwatch'>('timer')
  return (
    <div>
      <Segmented
        label="Mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'timer', label: 'Timer' },
          { value: 'stopwatch', label: 'Stopwatch' }
        ]}
      />
      {/* Both stay mounted so a running timer keeps going while the stopwatch is shown. */}
      <div hidden={mode !== 'timer'}>
        <Countdown />
      </div>
      <div hidden={mode !== 'stopwatch'}>
        <Stopwatch />
      </div>
    </div>
  )
}
