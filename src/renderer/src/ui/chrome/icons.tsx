import {
  ArrowUpRight,
  Calculator,
  Clock,
  Eraser,
  Hand,
  Highlighter,
  Hexagon,
  Image,
  Library,
  MousePointer2,
  PenTool,
  Pencil,
  CircleDot,
  Redo2,
  Shapes,
  Sigma,
  Type,
  Undo2,
  GraduationCap,
  type LucideIcon
} from 'lucide-react'
import { shapeOutline } from '../../core/geometry'
import type { ShapeKind } from '../../core/model'

export const TOOL_ICONS: Record<string, LucideIcon> = {
  select: MousePointer2,
  pan: Hand,
  pen: Pencil,
  highlighter: Highlighter,
  eraser: Eraser,
  shape: Shapes,
  line: ArrowUpRight,
  polygon: Hexagon,
  text: Type,
  math: Sigma,
  insert: Image,
  laser: CircleDot,
  teaching: GraduationCap,
  resources: Library,
  undo: Undo2,
  redo: Redo2,
  timer: Clock,
  calculator: Calculator,
  polyline: PenTool
}

/** Draws the real outline of a shape kind, so icons always match what is drawn. */
export function ShapeIcon({ kind, size = 20 }: { kind: ShapeKind; size?: number }) {
  const pad = 3
  const box = size - pad * 2
  const h = kind === 'parallelogram' || kind === 'trapezoid' || kind === 'rect' || kind === 'roundRect' ? box * 0.72 : box
  const y = pad + (box - h) / 2
  let d: string
  if (kind === 'ellipse') {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shape-icon">
        <ellipse cx={size / 2} cy={size / 2} rx={box / 2} ry={box / 2.6} />
      </svg>
    )
  }
  if (kind === 'roundRect') {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shape-icon">
        <rect x={pad} y={y} width={box} height={h} rx={h * 0.25} />
      </svg>
    )
  }
  const pts = shapeOutline({ kind, x: pad, y, w: box, h, flipX: false, flipY: false })
  d = `M ${pts[0]} ${pts[1]}`
  for (let i = 2; i < pts.length; i += 2) d += ` L ${pts[i]} ${pts[i + 1]}`
  d += ' Z'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shape-icon">
      <path d={d} />
    </svg>
  )
}

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rect: 'Rectangle',
  roundRect: 'Rounded rectangle',
  ellipse: 'Ellipse / circle',
  triangle: 'Triangle',
  rightTriangle: 'Right triangle',
  diamond: 'Diamond',
  parallelogram: 'Parallelogram',
  trapezoid: 'Trapezoid',
  pentagon: 'Pentagon',
  hexagon: 'Hexagon',
  star: 'Star'
}

/** Small preview of a line style for the line tool menu. */
export function LineIcon({ start, end, dash, size = 20 }: { start: string; end: string; dash: string; size?: number }) {
  const da = dash === 'dashed' ? '4 3' : dash === 'dotted' ? '0.5 3' : undefined
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" className="line-icon">
      <line x1="3" y1="17" x2="17" y2="3" strokeDasharray={da} />
      {end === 'arrow' && <path d="M17 3 L10.5 5 L15 9.5 Z" className="fill" />}
      {start === 'arrow' && <path d="M3 17 L9.5 15 L5 10.5 Z" className="fill" />}
      {end === 'dot' && <circle cx="17" cy="3" r="2.2" className="fill" />}
      {start === 'dot' && <circle cx="3" cy="17" r="2.2" className="fill" />}
    </svg>
  )
}
