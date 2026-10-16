import { memo, useEffect, useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import type { Background, PatternKind } from '../../core/model'
import { drawBackground } from '../../core/render'
import { resources } from '../../core/resources'
import { api } from '../../platform'
import { currentPage, useDoc } from '../../state/doc'
import { makeAsset, previewBackground, setBackground, setLessonDefaultBackground, type Scope } from '../../state/ops'
import { useSettings } from '../../state/settings'
import { useUi } from '../../state/ui'
import { ColorRow, cx, Segmented } from '../primitives'

interface Template {
  id: string
  label: string
  bg: Omit<Background, 'imageAssetId' | 'imageFit'>
}

/** Ready-made backgrounds for common subjects. */
export const TEMPLATES: Template[] = [
  { id: 'plain', label: 'Plain', bg: { color: '#FFFFFF', pattern: 'none', patternColor: '#C9D3DE', spacing: 40 } },
  { id: 'grid', label: 'Grid', bg: { color: '#FFFFFF', pattern: 'grid', patternColor: '#D3DBE4', spacing: 40 } },
  { id: 'graph', label: 'Graph paper', bg: { color: '#FCFFFD', pattern: 'graph', patternColor: '#9FD3C5', spacing: 20 } },
  { id: 'dots', label: 'Dot grid', bg: { color: '#FFFFFF', pattern: 'dots', patternColor: '#A9B4C2', spacing: 36 } },
  { id: 'ruled', label: 'Ruled lines', bg: { color: '#FFFFFF', pattern: 'lines', patternColor: '#B9D2EA', spacing: 44 } },
  { id: 'handwriting', label: 'Handwriting', bg: { color: '#FFFFFF', pattern: 'handwriting', patternColor: '#7FA7D8', spacing: 48 } },
  { id: 'music', label: 'Music staves', bg: { color: '#FFFDF7', pattern: 'music', patternColor: '#3E4652', spacing: 56 } },
  { id: 'isometric', label: 'Isometric', bg: { color: '#FFFFFF', pattern: 'isometric', patternColor: '#D5DCE5', spacing: 40 } },
  { id: 'coordinate', label: 'Coordinate plane', bg: { color: '#FFFFFF', pattern: 'coordinate', patternColor: '#C5D0DB', spacing: 48 } },
  { id: 'chalkboard', label: 'Chalkboard', bg: { color: '#21463A', pattern: 'none', patternColor: '#3D6657', spacing: 40 } },
  { id: 'chalk-grid', label: 'Chalkboard grid', bg: { color: '#21463A', pattern: 'grid', patternColor: '#355E50', spacing: 48 } },
  { id: 'blackboard', label: 'Blackboard', bg: { color: '#1C1F24', pattern: 'none', patternColor: '#3A3F48', spacing: 40 } },
  { id: 'blueprint', label: 'Blueprint', bg: { color: '#1D4F8C', pattern: 'graph', patternColor: '#4E7DB8', spacing: 20 } },
  { id: 'cream', label: 'Cream paper', bg: { color: '#FBF5E6', pattern: 'lines', patternColor: '#D9CBA8', spacing: 44 } }
]

const PATTERN_LABELS: Record<PatternKind, string> = {
  none: 'None',
  grid: 'Grid',
  graph: 'Graph',
  dots: 'Dots',
  lines: 'Ruled',
  handwriting: 'Handwriting',
  music: 'Music',
  isometric: 'Isometric',
  coordinate: 'Coordinate'
}

const PAGE_COLORS = ['#FFFFFF', '#FBF5E6', '#F3F6F9', '#E8F4EF', '#FFF4D6', '#21463A', '#1C1F24', '#1D4F8C']

const Preview = memo(function Preview({ bg, active }: { bg: Background; active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const w = 96
    const h = 54
    c.width = w * dpr
    c.height = h * dpr
    const ctx = c.getContext('2d')!
    // Draw at page scale (a 1/5 slice of a 16:9 page) so patterns read clearly.
    const k = (w * dpr) / 480
    ctx.setTransform(k, 0, 0, k, 0, 0)
    drawBackground(ctx, 480, 270, bg, { doc: useDoc.getState().doc, resources })
  }, [bg])
  return <canvas ref={ref} className={cx('bg-preview', active && 'is-active')} style={{ width: 96, height: 54 }} aria-hidden="true" />
})

export function BackgroundPanel() {
  const page = useDoc((s) => currentPage(s))
  const bg = page.background
  const [scope, setScope] = useState<Scope>('page')
  const palette = useSettings((s) => s.settings.palette)
  const sliding = useRef(false)

  const apply = (patch: Partial<Background>) => setBackground(patch, scope)

  const chooseImage = async () => {
    try {
      const files = await api.pickFiles('image')
      const f = files[0]
      if (!f) return
      const asset = makeAsset(f.bytes, f.mime, f.name)
      setBackground({ imageAssetId: asset.id, imageFit: bg.imageFit }, scope, asset)
    } catch (err) {
      useUi.getState().toast(`Could not use that image: ${err instanceof Error ? err.message : err}`, 'error')
    }
  }

  const isTemplate = (t: Template) =>
    t.bg.color.toLowerCase() === bg.color.toLowerCase() && t.bg.pattern === bg.pattern && t.bg.patternColor.toLowerCase() === bg.patternColor.toLowerCase()

  return (
    <div className="bg-panel">
      <div className="panel-section">
        <div className="panel-label">Apply to</div>
        <Segmented<Scope>
          label="Apply background to"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'page', label: 'This page' },
            { value: 'section', label: 'Section' },
            { value: 'all', label: 'All pages' }
          ]}
        />
      </div>

      <div className="panel-section">
        <div className="panel-label">Templates</div>
        <div className="bg-templates">
          {TEMPLATES.map((t) => (
            <button key={t.id} type="button" className="bg-template" onClick={() => apply({ ...t.bg })} aria-pressed={isTemplate(t)}>
              <Preview bg={{ ...t.bg, imageAssetId: null, imageFit: 'cover' }} active={isTemplate(t)} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-label">Page colour</div>
        <ColorRow colors={PAGE_COLORS} value={bg.color} onChange={(c) => c && apply({ color: c })} />
      </div>

      <div className="panel-section">
        <div className="panel-label">Pattern</div>
        <div className="chip-row">
          {(Object.keys(PATTERN_LABELS) as PatternKind[]).map((p) => (
            <button key={p} type="button" className={cx('chip', bg.pattern === p && 'is-active')} onClick={() => apply({ pattern: p })}>
              {PATTERN_LABELS[p]}
            </button>
          ))}
        </div>
        {bg.pattern !== 'none' && (
          <>
            <div className="panel-label panel-label--sub">Pattern colour</div>
            <ColorRow colors={['#D3DBE4', '#A9B4C2', '#9FD3C5', '#B9D2EA', '#3E4652', ...palette.slice(5, 7)]} value={bg.patternColor} onChange={(c) => c && apply({ patternColor: c })} />
            <label className="slider">
              <span className="slider__label">Spacing</span>
              <input
                type="range"
                min={10}
                max={160}
                value={bg.spacing}
                onPointerDown={() => {
                  sliding.current = true
                  useDoc.getState().begin()
                }}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (sliding.current) previewBackground({ spacing: v }, scope)
                  else apply({ spacing: v })
                }}
                onPointerUp={() => {
                  sliding.current = false
                  useDoc.getState().end('Change background')
                }}
                aria-label="Pattern spacing"
              />
              <span className="slider__value">{bg.spacing}px</span>
            </label>
          </>
        )}
      </div>

      <div className="panel-section">
        <div className="panel-label">Background image</div>
        <div className="row">
          <button type="button" className="btn btn--secondary btn--small" onClick={chooseImage}>
            <ImagePlus size={15} /> {bg.imageAssetId ? 'Replace image…' : 'Choose image…'}
          </button>
          {bg.imageAssetId && (
            <button type="button" className="btn btn--ghost btn--small" onClick={() => apply({ imageAssetId: null })}>
              <Trash2 size={15} /> Remove
            </button>
          )}
        </div>
        {bg.imageAssetId && (
          <div className="chip-row" style={{ marginTop: 8 }}>
            {(['cover', 'contain', 'stretch', 'center'] as const).map((f) => (
              <button key={f} type="button" className={cx('chip', bg.imageFit === f && 'is-active')} onClick={() => apply({ imageFit: f })}>
                {{ cover: 'Fill', contain: 'Fit', stretch: 'Stretch', center: 'Centre' }[f]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="panel-section panel-section--footer">
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => {
            setLessonDefaultBackground(bg)
            useUi.getState().toast('New pages in this lesson will use this background.', 'success')
          }}
        >
          Use for new pages in this lesson
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => {
            useSettings.getState().update((s) => ({ ...s, background: { ...bg, imageAssetId: null, imageFit: 'cover' } }))
            useUi.getState().toast('New lessons will start with this background.', 'success')
          }}
        >
          Make default for new lessons
        </button>
      </div>
    </div>
  )
}
