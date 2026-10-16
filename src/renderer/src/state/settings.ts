import { create } from 'zustand'
import type { EraserMode } from '../core/eraser'
import {
  DEFAULT_BACKGROUND,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
  PATTERN_KINDS,
  SHAPE_KINDS,
  type Background,
  type DashStyle,
  type LineCap,
  type PenStyle,
  type ShapeKind,
  type TextAlign
} from '../core/model'
import type { KeymapOverrides } from '../core/shortcuts'
import { isValidHex } from '../core/color'
import { api } from '../platform'

export type ThemePref = 'system' | 'light' | 'dark'

export type ToolbarItemId =
  | 'select'
  | 'pan'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'shape'
  | 'line'
  | 'polygon'
  | 'text'
  | 'math'
  | 'insert'
  | 'laser'
  | 'teaching'
  | 'resources'
  | 'undo'
  | 'redo'

export const ALL_TOOLBAR_ITEMS: { id: ToolbarItemId; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'pan', label: 'Hand (pan)' },
  { id: 'pen', label: 'Pen' },
  { id: 'highlighter', label: 'Highlighter' },
  { id: 'eraser', label: 'Eraser' },
  { id: 'shape', label: 'Shapes' },
  { id: 'line', label: 'Lines & arrows' },
  { id: 'polygon', label: 'Polygon' },
  { id: 'text', label: 'Text' },
  { id: 'math', label: 'Math equation' },
  { id: 'insert', label: 'Insert (image, table, PDF)' },
  { id: 'laser', label: 'Laser pointer' },
  { id: 'teaching', label: 'Teaching tools' },
  { id: 'resources', label: 'Resource library' },
  { id: 'undo', label: 'Undo' },
  { id: 'redo', label: 'Redo' }
]

export interface DrawingSettings {
  pen: { color: string; width: number; style: PenStyle }
  highlighter: { color: string; width: number }
  eraser: { size: number; mode: EraserMode }
  shape: { kind: ShapeKind; stroke: string; fill: string | null; strokeWidth: number; dash: DashStyle }
  line: { stroke: string; strokeWidth: number; dash: DashStyle; startCap: LineCap; endCap: LineCap }
  text: { fontFamily: string; fontSize: number; color: string; bold: boolean; italic: boolean; underline: boolean; align: TextAlign }
  math: { color: string; fontSize: number }
}

export interface AppSettings {
  version: 1
  theme: ThemePref
  pageSize: { width: number; height: number }
  background: Background
  drawing: DrawingSettings
  palette: string[]
  highlighterPalette: string[]
  shortcuts: KeymapOverrides
  toolbar: { items: ToolbarItemId[]; position: 'bottom' | 'left' }
  pressure: boolean
  touchAction: 'draw' | 'pan'
  recovery: boolean
  confirmPageDelete: boolean
}

export const DEFAULT_PALETTE = ['#1E2228', '#FFFFFF', '#D93B3B', '#F08C1A', '#F2C522', '#2FA84F', '#1E88E5', '#5B4FD8', '#C2389B', '#8B5A2B']
export const DEFAULT_HIGHLIGHTERS = ['#FFE14D', '#7CF07C', '#6FD3FF', '#FF8AD8', '#FFB054']

export function defaultSettings(): AppSettings {
  return {
    version: 1,
    theme: 'system',
    pageSize: { width: 1920, height: 1080 },
    background: { ...DEFAULT_BACKGROUND },
    drawing: {
      pen: { color: '#1E2228', width: 4, style: 'pen' },
      highlighter: { color: '#FFE14D', width: 22 },
      eraser: { size: 24, mode: 'partial' },
      shape: { kind: 'rect', stroke: '#1E2228', fill: null, strokeWidth: 3, dash: 'solid' },
      line: { stroke: '#1E2228', strokeWidth: 3, dash: 'solid', startCap: 'none', endCap: 'arrow' },
      text: { fontFamily: 'Atkinson Hyperlegible', fontSize: 36, color: '#1E2228', bold: false, italic: false, underline: false, align: 'left' },
      math: { color: '#1E2228', fontSize: 44 }
    },
    palette: [...DEFAULT_PALETTE],
    highlighterPalette: [...DEFAULT_HIGHLIGHTERS],
    shortcuts: {},
    toolbar: {
      items: ['select', 'pan', 'pen', 'highlighter', 'eraser', 'shape', 'line', 'text', 'math', 'insert', 'laser', 'teaching', 'undo', 'redo'],
      position: 'bottom'
    },
    pressure: true,
    touchAction: 'draw',
    recovery: true,
    confirmPageDelete: true
  }
}

// ---------------------------------------------------------------------------
// Validation: anything malformed falls back to the default for that field.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const color = (v: unknown, d: string) => (typeof v === 'string' && isValidHex(v) ? v : d)
const nullableColor = (v: unknown, d: string | null) => (v === null ? null : typeof v === 'string' && isValidHex(v) ? v : d)
const num = (v: unknown, d: number, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d)
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
function oneOf<T extends string>(v: unknown, opts: readonly T[], d: T): T {
  return typeof v === 'string' && (opts as readonly string[]).includes(v) ? (v as T) : d
}

export function sanitizeSettings(raw: unknown): AppSettings {
  const d = defaultSettings()
  if (!isObj(raw)) return d
  const dr = isObj(raw.drawing) ? raw.drawing : {}
  const sub = (k: string) => (isObj(dr[k]) ? (dr[k] as Record<string, unknown>) : {})
  const pen = sub('pen')
  const hl = sub('highlighter')
  const er = sub('eraser')
  const sh = sub('shape')
  const ln = sub('line')
  const tx = sub('text')
  const mt = sub('math')
  const dashes = ['solid', 'dashed', 'dotted'] as const
  const caps = ['none', 'arrow', 'dot'] as const
  const bg = isObj(raw.background) ? raw.background : {}
  const ps = isObj(raw.pageSize) ? raw.pageSize : {}
  const tb = isObj(raw.toolbar) ? raw.toolbar : {}
  const validItems = new Set(ALL_TOOLBAR_ITEMS.map((i) => i.id))
  const items = Array.isArray(tb.items) ? (tb.items.filter((i) => typeof i === 'string' && validItems.has(i as ToolbarItemId)) as ToolbarItemId[]) : d.toolbar.items
  const palette = Array.isArray(raw.palette) && raw.palette.length === 10 ? raw.palette.map((c, i) => color(c, d.palette[i])) : d.palette
  const hlPalette =
    Array.isArray(raw.highlighterPalette) && raw.highlighterPalette.length === 5
      ? raw.highlighterPalette.map((c, i) => color(c, d.highlighterPalette[i]))
      : d.highlighterPalette
  const shortcuts: KeymapOverrides = {}
  if (isObj(raw.shortcuts)) {
    for (const [k, v] of Object.entries(raw.shortcuts)) {
      if (Array.isArray(v) && v.every((b) => typeof b === 'string' && b.length < 40)) shortcuts[k] = v as string[]
    }
  }
  return {
    version: 1,
    theme: oneOf(raw.theme, ['system', 'light', 'dark'] as const, d.theme),
    pageSize: {
      width: num(ps.width, d.pageSize.width, MIN_PAGE_SIZE, MAX_PAGE_SIZE),
      height: num(ps.height, d.pageSize.height, MIN_PAGE_SIZE, MAX_PAGE_SIZE)
    },
    background: {
      color: color(bg.color, d.background.color),
      pattern: oneOf(bg.pattern, PATTERN_KINDS, d.background.pattern),
      patternColor: color(bg.patternColor, d.background.patternColor),
      spacing: num(bg.spacing, d.background.spacing, 8, 400),
      imageAssetId: null,
      imageFit: 'cover'
    },
    drawing: {
      pen: { color: color(pen.color, d.drawing.pen.color), width: num(pen.width, d.drawing.pen.width, 1, 60), style: oneOf(pen.style, ['pen', 'marker', 'dashed'] as const, d.drawing.pen.style) },
      highlighter: { color: color(hl.color, d.drawing.highlighter.color), width: num(hl.width, d.drawing.highlighter.width, 4, 80) },
      eraser: { size: num(er.size, d.drawing.eraser.size, 4, 200), mode: oneOf(er.mode, ['partial', 'object'] as const, d.drawing.eraser.mode) },
      shape: {
        kind: oneOf(sh.kind, SHAPE_KINDS, d.drawing.shape.kind),
        stroke: color(sh.stroke, d.drawing.shape.stroke),
        fill: nullableColor(sh.fill, d.drawing.shape.fill),
        strokeWidth: num(sh.strokeWidth, d.drawing.shape.strokeWidth, 0, 40),
        dash: oneOf(sh.dash, dashes, d.drawing.shape.dash)
      },
      line: {
        stroke: color(ln.stroke, d.drawing.line.stroke),
        strokeWidth: num(ln.strokeWidth, d.drawing.line.strokeWidth, 1, 40),
        dash: oneOf(ln.dash, dashes, d.drawing.line.dash),
        startCap: oneOf(ln.startCap, caps, d.drawing.line.startCap),
        endCap: oneOf(ln.endCap, caps, d.drawing.line.endCap)
      },
      text: {
        fontFamily: typeof tx.fontFamily === 'string' && tx.fontFamily.length < 100 ? tx.fontFamily : d.drawing.text.fontFamily,
        fontSize: num(tx.fontSize, d.drawing.text.fontSize, 8, 300),
        color: color(tx.color, d.drawing.text.color),
        bold: bool(tx.bold, false),
        italic: bool(tx.italic, false),
        underline: bool(tx.underline, false),
        align: oneOf(tx.align, ['left', 'center', 'right'] as const, 'left')
      },
      math: { color: color(mt.color, d.drawing.math.color), fontSize: num(mt.fontSize, d.drawing.math.fontSize, 10, 300) }
    },
    palette,
    highlighterPalette: hlPalette,
    shortcuts,
    toolbar: { items: items.length ? items : d.toolbar.items, position: oneOf(tb.position, ['bottom', 'left'] as const, 'bottom') },
    pressure: bool(raw.pressure, d.pressure),
    touchAction: oneOf(raw.touchAction, ['draw', 'pan'] as const, d.touchAction),
    recovery: bool(raw.recovery, d.recovery),
    confirmPageDelete: bool(raw.confirmPageDelete, d.confirmPageDelete)
  }
}

// ---------------------------------------------------------------------------
// Store

interface SettingsStore {
  settings: AppSettings
  loaded: boolean
  load(): Promise<void>
  update(fn: (s: AppSettings) => AppSettings): void
  updateDrawing<K extends keyof DrawingSettings>(key: K, patch: Partial<DrawingSettings[K]>): void
  reset(): void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function persist(s: AppSettings): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    api.writeStore('settings', s).catch((err) => console.error('Could not save settings', err))
  }, 300)
}

/** Writes pending settings immediately (used before the window closes). */
export function flushSettings(): Promise<void> {
  if (!saveTimer) return Promise.resolve()
  clearTimeout(saveTimer)
  saveTimer = null
  return api.writeStore('settings', useSettings.getState().settings)
}

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: defaultSettings(),
  loaded: false,
  async load() {
    const raw = await api.readStore('settings').catch(() => null)
    set({ settings: sanitizeSettings(raw), loaded: true })
  },
  update(fn) {
    const next = fn(get().settings)
    set({ settings: next })
    persist(next)
  },
  updateDrawing(key, patch) {
    get().update((s) => ({ ...s, drawing: { ...s.drawing, [key]: { ...s.drawing[key], ...patch } } }))
  },
  reset() {
    const d = defaultSettings()
    set({ settings: d })
    persist(d)
  }
}))
