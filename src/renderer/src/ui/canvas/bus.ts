/**
 * Lightweight channels for high-frequency canvas events that should not go
 * through React state (pointer position for the magnifier/spotlight, the base
 * canvas element for the magnifier).
 */
type Listener<T> = (v: T) => void

function channel<T>() {
  const ls = new Set<Listener<T>>()
  let last: T | undefined
  return {
    emit(v: T) {
      last = v
      for (const l of ls) l(v)
    },
    on(l: Listener<T>) {
      ls.add(l)
      return () => {
        ls.delete(l)
      }
    },
    get last() {
      return last
    }
  }
}

/** Pointer position in canvas-host coordinates (CSS px). */
export const pointerChannel = channel<{ x: number; y: number; inside: boolean }>()

/** Fired after the base canvas has been redrawn. */
export const renderChannel = channel<HTMLCanvasElement>()

/** Whether the space bar is held (temporary hand tool). */
export const keyState = { space: false }
