import type { Id } from '../core/model'
import type { Viewport } from '../core/viewport'

/** A pointer sample in page coordinates (x, y) and canvas-relative screen coordinates (sx, sy). */
export interface PointerSample {
  x: number
  y: number
  sx: number
  sy: number
  /** 0..1; 0.5 for devices without pressure. */
  pressure: number
  pointerType: string
  shift: boolean
  alt: boolean
  mod: boolean
  buttons: number
  time: number
}

export interface ToolContext {
  pageId: Id
  viewport: Viewport
  setViewport(v: Viewport): void
  /** Request an overlay redraw (cheap; coalesced per frame). */
  requestOverlay(): void
  setCursor(cursor: string): void
}

export interface Tool {
  readonly cursor: string
  down(p: PointerSample, ctx: ToolContext): void
  move(p: PointerSample, samples: PointerSample[], ctx: ToolContext): void
  up(p: PointerSample, ctx: ToolContext): void
  cancel(ctx: ToolContext): void
  /** Pointer movement without a pressed button. */
  hover?(p: PointerSample, ctx: ToolContext): void
  doubleClick?(p: PointerSample, ctx: ToolContext): void
  /** Draws transient feedback. The context is already transformed to page coordinates. */
  drawOverlay?(g: CanvasRenderingContext2D, zoom: number, now: number): void
  /** Returns true while the overlay needs continuous animation (e.g. laser trail). */
  animating?(): boolean
  /** Keyboard input routed to the tool; return true when handled. */
  key?(e: KeyboardEvent, ctx: ToolContext): boolean
  /** True while a gesture is in progress. */
  active(): boolean
}
