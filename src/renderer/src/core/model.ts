/**
 * The lesson document model. Every value here is plain, serialisable data in
 * page coordinates (CSS pixels at 100% zoom). Rendering, viewport and UI state
 * live elsewhere; the document never depends on the screen.
 */

export type Id = string

export type DashStyle = 'solid' | 'dashed' | 'dotted'
export type PenStyle = 'pen' | 'marker' | 'dashed'
export type LineCap = 'none' | 'arrow' | 'dot'

export type ShapeKind =
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'triangle'
  | 'rightTriangle'
  | 'diamond'
  | 'parallelogram'
  | 'trapezoid'
  | 'pentagon'
  | 'hexagon'
  | 'star'

export const SHAPE_KINDS: ShapeKind[] = [
  'rect',
  'roundRect',
  'ellipse',
  'triangle',
  'rightTriangle',
  'diamond',
  'parallelogram',
  'trapezoid',
  'pentagon',
  'hexagon',
  'star'
]

export interface StrokeObject {
  id: Id
  type: 'stroke'
  tool: 'pen' | 'highlighter'
  style: PenStyle
  color: string
  width: number
  opacity: number
  /** Flat [x, y, pressure, x, y, pressure, …] triplets. Pressure is 0..1. */
  points: number[]
  /** True when the pressure values came from a pressure-sensitive device. */
  pressure: boolean
}

export interface ShapeObject {
  id: Id
  type: 'shape'
  kind: ShapeKind
  x: number
  y: number
  w: number
  h: number
  stroke: string
  fill: string | null
  strokeWidth: number
  dash: DashStyle
  /** Mirrors the shape horizontally/vertically (used by asymmetric shapes). */
  flipX: boolean
  flipY: boolean
}

export interface LineObject {
  id: Id
  type: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  stroke: string
  strokeWidth: number
  dash: DashStyle
  startCap: LineCap
  endCap: LineCap
}

export interface PolygonObject {
  id: Id
  type: 'polygon'
  /** Flat [x, y, x, y, …] vertices. */
  points: number[]
  closed: boolean
  stroke: string
  fill: string | null
  strokeWidth: number
  dash: DashStyle
}

export type TextAlign = 'left' | 'center' | 'right'

export interface TextObject {
  id: Id
  type: 'text'
  x: number
  y: number
  w: number
  /** Laid-out height, recomputed whenever text, font or width changes. */
  h: number
  text: string
  fontFamily: string
  fontSize: number
  color: string
  bold: boolean
  italic: boolean
  underline: boolean
  align: TextAlign
  background: string | null
}

export interface MathObject {
  id: Id
  type: 'math'
  x: number
  y: number
  w: number
  h: number
  latex: string
  color: string
  fontSize: number
}

export interface ImageObject {
  id: Id
  type: 'image'
  x: number
  y: number
  w: number
  h: number
  assetId: Id
  opacity: number
  name: string
}

export interface TableObject {
  id: Id
  type: 'table'
  x: number
  y: number
  colWidths: number[]
  rowHeights: number[]
  cells: string[][]
  stroke: string
  strokeWidth: number
  fill: string | null
  headerFill: string | null
  color: string
  fontFamily: string
  fontSize: number
}

export type BoardObject =
  | StrokeObject
  | ShapeObject
  | LineObject
  | PolygonObject
  | TextObject
  | MathObject
  | ImageObject
  | TableObject

export type BoardObjectType = BoardObject['type']

export type PatternKind =
  | 'none'
  | 'grid'
  | 'graph'
  | 'dots'
  | 'lines'
  | 'handwriting'
  | 'music'
  | 'isometric'
  | 'coordinate'

export const PATTERN_KINDS: PatternKind[] = [
  'none',
  'grid',
  'graph',
  'dots',
  'lines',
  'handwriting',
  'music',
  'isometric',
  'coordinate'
]

export type ImageFit = 'cover' | 'contain' | 'stretch' | 'center'

export interface Background {
  color: string
  pattern: PatternKind
  patternColor: string
  /** Pattern spacing in page pixels. */
  spacing: number
  imageAssetId: Id | null
  imageFit: ImageFit
}

export interface Page {
  id: Id
  width: number
  height: number
  background: Background
  objects: BoardObject[]
}

export interface Section {
  id: Id
  name: string
  collapsed: boolean
  pages: Page[]
}

export interface Asset {
  id: Id
  mime: string
  name: string
  data: Uint8Array
}

export interface PageDefaults {
  width: number
  height: number
  background: Background
}

export interface LessonDocument {
  id: Id
  title: string
  createdAt: string
  modifiedAt: string
  pageDefaults: PageDefaults
  sections: Section[]
  assets: Record<Id, Asset>
}

// ---------------------------------------------------------------------------
// Page sizes

export interface PageSizePreset {
  id: string
  label: string
  width: number
  height: number
}

export const PAGE_SIZE_PRESETS: PageSizePreset[] = [
  { id: '16:9', label: 'Widescreen 16:9', width: 1920, height: 1080 },
  { id: '16:10', label: 'Widescreen 16:10', width: 1920, height: 1200 },
  { id: '4:3', label: 'Standard 4:3', width: 1600, height: 1200 },
  { id: 'a4-landscape', label: 'A4 Landscape', width: 1754, height: 1240 },
  { id: 'a4-portrait', label: 'A4 Portrait', width: 1240, height: 1754 },
  { id: 'letter-landscape', label: 'Letter Landscape', width: 1650, height: 1275 },
  { id: 'letter-portrait', label: 'Letter Portrait', width: 1275, height: 1650 },
  { id: 'square', label: 'Square 1:1', width: 1400, height: 1400 }
]

export const MIN_PAGE_SIZE = 200
export const MAX_PAGE_SIZE = 8000

export function findPresetFor(width: number, height: number): PageSizePreset | undefined {
  return PAGE_SIZE_PRESETS.find((p) => p.width === width && p.height === height)
}

export const DEFAULT_BACKGROUND: Background = {
  color: '#FFFFFF',
  pattern: 'none',
  patternColor: '#C9D3DE',
  spacing: 40,
  imageAssetId: null,
  imageFit: 'cover'
}
