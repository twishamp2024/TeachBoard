import { centerAt, clampZoom, nextZoomStep, zoomAt, type Viewport } from '../core/viewport'
import type { Page } from '../core/model'
import { currentPage, useDoc } from './doc'
import { useSettings } from './settings'
import { useUi } from './ui'

/**
 * Fits the page into the canvas area, leaving room for the floating tool
 * dock so the bottom of the page stays reachable.
 */
export function fitViewport(viewW: number, viewH: number, page: Pick<Page, 'width' | 'height'>): Viewport {
  const dockLeft = useSettings.getState().settings.toolbar.position === 'left'
  const m = { top: 24, bottom: dockLeft ? 24 : 92, left: dockLeft ? 84 : 28, right: 28 }
  const availW = Math.max(50, viewW - m.left - m.right)
  const availH = Math.max(50, viewH - m.top - m.bottom)
  const zoom = clampZoom(Math.min(availW / page.width, availH / page.height))
  return { zoom, panX: m.left + (availW - page.width * zoom) / 2, panY: m.top + (availH - page.height * zoom) / 2 }
}

export function fittedViewport(page: Page): Viewport {
  const { w, h } = useUi.getState().viewSize
  return fitViewport(w, h, page)
}

/** The current page's viewport (fitted unless the user has zoomed or panned). */
export function viewportFor(page: Page): Viewport {
  const v = useUi.getState().viewports[page.id]
  return v && !v.fit ? v : fittedViewport(page)
}

export function fitView(): void {
  const page = currentPage(useDoc.getState())
  useUi.getState().setViewport(page.id, { ...fittedViewport(page), fit: true })
}

export function zoomTo(zoom: number, anchor?: { x: number; y: number }): void {
  const page = currentPage(useDoc.getState())
  const { w, h } = useUi.getState().viewSize
  const v = viewportFor(page)
  const a = anchor ?? { x: w / 2, y: h / 2 }
  useUi.getState().setViewport(page.id, { ...zoomAt(v, zoom, a.x, a.y), fit: false })
}

export function zoomStep(dir: 1 | -1): void {
  const v = viewportFor(currentPage(useDoc.getState()))
  zoomTo(nextZoomStep(v.zoom, dir))
}

export function zoomActual(): void {
  const page = currentPage(useDoc.getState())
  const { w, h } = useUi.getState().viewSize
  useUi.getState().setViewport(page.id, { ...centerAt(w, h, page.width, page.height, 1), fit: false })
}
