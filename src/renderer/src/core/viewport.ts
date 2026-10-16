import type { Point } from './geometry'

/**
 * Maps page coordinates to screen (CSS pixel) coordinates within the canvas
 * element: screen = page × zoom + pan. The document is never modified by
 * viewport changes.
 */
export interface Viewport {
  zoom: number
  panX: number
  panY: number
}

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 8

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

export function screenToPage(v: Viewport, sx: number, sy: number): Point {
  return { x: (sx - v.panX) / v.zoom, y: (sy - v.panY) / v.zoom }
}

export function pageToScreen(v: Viewport, px: number, py: number): Point {
  return { x: px * v.zoom + v.panX, y: py * v.zoom + v.panY }
}

/** Zooms to `zoom` keeping the screen point (sx, sy) fixed over the same page point. */
export function zoomAt(v: Viewport, zoom: number, sx: number, sy: number): Viewport {
  const z = clampZoom(zoom)
  const p = screenToPage(v, sx, sy)
  return { zoom: z, panX: sx - p.x * z, panY: sy - p.y * z }
}

/** Fits a page into a view with a margin, centred. */
export function fitPage(viewW: number, viewH: number, pageW: number, pageH: number, margin = 32): Viewport {
  const availW = Math.max(50, viewW - margin * 2)
  const availH = Math.max(50, viewH - margin * 2)
  const zoom = clampZoom(Math.min(availW / pageW, availH / pageH))
  return { zoom, panX: (viewW - pageW * zoom) / 2, panY: (viewH - pageH * zoom) / 2 }
}

/** Centres the page at a given zoom. */
export function centerAt(viewW: number, viewH: number, pageW: number, pageH: number, zoom: number): Viewport {
  const z = clampZoom(zoom)
  return { zoom: z, panX: (viewW - pageW * z) / 2, panY: (viewH - pageH * z) / 2 }
}

/** Preset zoom steps used by zoom in/out commands. */
export const ZOOM_STEPS = [0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8]

export function nextZoomStep(current: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > current + 1e-3) ?? MAX_ZOOM
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) if (ZOOM_STEPS[i] < current - 1e-3) return ZOOM_STEPS[i]
  return MIN_ZOOM
}
