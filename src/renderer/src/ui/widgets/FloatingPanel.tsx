import { useRef, useState, type ReactNode } from 'react'
import { GripHorizontal, X } from 'lucide-react'

const positions = new Map<string, { x: number; y: number }>()

/** A small draggable window for teaching tools. Its position is remembered for the session. */
export function FloatingPanel({ id, title, onClose, children, width, initial }: { id: string; title: string; onClose: () => void; children: ReactNode; width: number; initial: { x: number; y: number } }) {
  const [pos, setPos] = useState(() => positions.get(id) ?? initial)
  const ref = useRef<HTMLDivElement>(null)

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const start = pos
    const parent = ref.current?.parentElement?.getBoundingClientRect()
    const move = (ev: PointerEvent) => {
      const el = ref.current
      let x = start.x + ev.clientX - startX
      let y = start.y + ev.clientY - startY
      if (parent && el) {
        x = Math.max(0, Math.min(parent.width - el.offsetWidth, x))
        y = Math.max(0, Math.min(parent.height - 40, y))
      }
      const p = { x, y }
      positions.set(id, p)
      setPos(p)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <section ref={ref} className="floating no-canvas-wheel" style={{ left: pos.x, top: pos.y, width }} aria-label={title}>
      <header className="floating__head" onPointerDown={onDown}>
        <GripHorizontal size={14} className="floating__grip" aria-hidden="true" />
        <h2>{title}</h2>
        <button type="button" className="icon-btn icon-btn--s" aria-label={`Close ${title}`} onClick={onClose}>
          <X size={15} />
        </button>
      </header>
      <div className="floating__body">{children}</div>
    </section>
  )
}
