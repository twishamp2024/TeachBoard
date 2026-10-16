import { memo, useEffect, useRef, useState } from 'react'
import type { Page } from '../../core/model'
import { renderPage } from '../../core/render'
import { resources } from '../../core/resources'
import { useDoc } from '../../state/doc'

// Thumbnails render one at a time, off the critical path of drawing.
const queue: (() => void)[] = []
let pumping = false
function schedule(job: () => void): () => void {
  queue.push(job)
  if (!pumping) {
    pumping = true
    const pump = () => {
      const next = queue.shift()
      if (!next) {
        pumping = false
        return
      }
      next()
      setTimeout(pump, 0)
    }
    setTimeout(pump, 30)
  }
  return () => {
    const i = queue.indexOf(job)
    if (i >= 0) queue.splice(i, 1)
  }
}

/** A live miniature of a page; it re-renders only when that page (or a loaded image) changes. */
export const Thumbnail = memo(function Thumbnail({ page, width }: { page: Page; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [version, setVersion] = useState(0)
  useEffect(() => resources.subscribe(() => setVersion((v) => v + 1)), [])
  const height = Math.round((width * page.height) / page.width)
  useEffect(() => {
    return schedule(() => {
      const canvas = ref.current
      if (!canvas) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      const ctx = canvas.getContext('2d')!
      const s = (width * dpr) / page.width
      ctx.setTransform(s, 0, 0, s, 0, 0)
      renderPage(ctx, page, { doc: useDoc.getState().doc, resources })
    })
  }, [page, width, height, version])
  return <canvas ref={ref} className="thumb__canvas" style={{ width, height }} aria-hidden="true" />
})
