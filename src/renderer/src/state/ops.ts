import type { Draft } from 'immer'
import {
  addSection as addSectionData,
  allPages,
  clonePage,
  cloneObject,
  createPage,
  deletePage as deletePageData,
  locatePage,
  movePage as movePageData,
  moveSection as moveSectionData,
  newId,
  pageCount,
  removeSection,
  translateObjectData
} from '../core/document'
import { objectBounds, scaleObject, unionRects, type Rect } from '../core/geometry'
import { renderMath } from '../core/math'
import type { Asset, Background, BoardObject, Id, ImageObject, LessonDocument, MathObject, Page, TableObject, TextObject } from '../core/model'
import { canvasMeasure, layoutText } from '../core/text'
import { currentPage, onPage, useDoc, type Recipe } from './doc'
import { useSettings } from './settings'
import { useUi } from './ui'

const docState = () => useDoc.getState()

export function getCurrentPage(): Page {
  return currentPage(docState())
}

export function getSelectedObjects(): BoardObject[] {
  const s = docState()
  const ids = new Set(s.selection)
  return currentPage(s).objects.filter((o) => ids.has(o.id))
}

export function selectionBounds(objs: BoardObject[] = getSelectedObjects()): Rect | null {
  return unionRects(objs.map(objectBounds))
}

/** Recomputes derived geometry (text height) after a text object changed. */
export function relayout<T extends BoardObject>(o: T): T {
  if (o.type === 'text') {
    const h = layoutText(o, canvasMeasure).height
    return (Math.abs(h - o.h) > 0.01 ? { ...o, h } : o) as T
  }
  return o
}

// ---------------------------------------------------------------------------
// Objects

export function addObjects(objects: BoardObject[], label = 'Add', select = true, assets: Asset[] = []): void {
  if (!objects.length) return
  const s = docState()
  s.commit(
    label,
    (d) => {
      for (const a of assets) d.assets[a.id] = a as Draft<Asset>
      onPage(s.pageId, (p) => {
        p.objects.push(...(objects as Draft<BoardObject>[]))
      })(d)
    },
    { select: select ? objects.map((o) => o.id) : s.selection }
  )
}

export function deleteSelection(): void {
  const s = docState()
  if (!s.selection.length) return
  const ids = new Set(s.selection)
  s.commit(
    s.selection.length > 1 ? 'Delete objects' : 'Delete',
    onPage(s.pageId, (p) => {
      p.objects = p.objects.filter((o) => !ids.has(o.id))
    }),
    { select: [] }
  )
}

export function duplicateSelection(offset = 24): void {
  const objs = getSelectedObjects()
  if (!objs.length) return
  addObjects(
    objs.map((o) => cloneObject(o, offset, offset)),
    'Duplicate'
  )
}

export function selectAll(): void {
  const s = docState()
  s.setSelection(currentPage(s).objects.map((o) => o.id))
}

export type ZOrder = 'front' | 'forward' | 'backward' | 'back'

export function reorderSelection(mode: ZOrder): void {
  const s = docState()
  if (!s.selection.length) return
  const ids = new Set(s.selection)
  s.commit(
    'Arrange',
    onPage(s.pageId, (p) => {
      const objs = p.objects as BoardObject[]
      const sel = objs.filter((o) => ids.has(o.id))
      const rest = objs.filter((o) => !ids.has(o.id))
      let next: BoardObject[]
      if (mode === 'front') next = [...rest, ...sel]
      else if (mode === 'back') next = [...sel, ...rest]
      else {
        next = objs.slice()
        if (mode === 'forward') {
          for (let i = next.length - 2; i >= 0; i--) {
            if (ids.has(next[i].id) && !ids.has(next[i + 1].id)) [next[i], next[i + 1]] = [next[i + 1], next[i]]
          }
        } else {
          for (let i = 1; i < next.length; i++) {
            if (ids.has(next[i].id) && !ids.has(next[i - 1].id)) [next[i], next[i - 1]] = [next[i - 1], next[i]]
          }
        }
      }
      p.objects = next as Draft<BoardObject>[]
    })
  )
}

/** Applies `fn` to the given objects on the current page as one undoable change. */
export function updateObjects(ids: Id[], label: string, fn: (o: BoardObject) => BoardObject): void {
  const s = docState()
  if (!ids.length) return
  const set = new Set(ids)
  s.commit(
    label,
    onPage(s.pageId, (p) => {
      p.objects = (p.objects as BoardObject[]).map((o) => (set.has(o.id) ? relayout(fn(o)) : o)) as Draft<BoardObject>[]
    })
  )
}

export function nudgeSelection(dx: number, dy: number): void {
  const s = docState()
  updateObjects(s.selection, 'Move', (o) => translateObjectData(o, dx, dy))
}

/** Places a rect centred in the current page's visible area (or the page centre). */
export function centeredRect(w: number, h: number): Rect {
  const page = getCurrentPage()
  const vp = useUi.getState().viewports[page.id]
  let cx = page.width / 2
  let cy = page.height / 2
  const el = document.querySelector('[data-canvas-host]') as HTMLElement | null
  if (vp && el) {
    cx = (el.clientWidth / 2 - vp.panX) / vp.zoom
    cy = (el.clientHeight / 2 - vp.panY) / vp.zoom
    cx = Math.min(page.width - w / 2, Math.max(w / 2, cx))
    cy = Math.min(page.height - h / 2, Math.max(h / 2, cy))
  }
  // Cascade repeated inserts so they don't land exactly on top of each other.
  let x = cx - w / 2
  let y = cy - h / 2
  const taken = (px: number, py: number) => page.objects.some((o) => {
    const b = objectBounds(o)
    return Math.abs(b.x - px) < 4 && Math.abs(b.y - py) < 4
  })
  for (let i = 0; i < 12 && taken(x, y); i++) {
    x += 28
    y += 28
  }
  return { x, y, w, h }
}

export async function imageSize(bytes: Uint8Array, mime: string): Promise<{ w: number; h: number }> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return { w: img.naturalWidth || 400, h: img.naturalHeight || 300 }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function makeAsset(bytes: Uint8Array, mime: string, name: string): Asset {
  return { id: newId('a'), mime, name, data: bytes }
}

export async function insertImages(files: { name: string; mime: string; bytes: Uint8Array }[], at?: { x: number; y: number }): Promise<void> {
  const page = getCurrentPage()
  const objects: ImageObject[] = []
  const assets: Asset[] = []
  let offset = 0
  for (const f of files) {
    if (!f.mime.startsWith('image/')) continue
    let size: { w: number; h: number }
    try {
      size = await imageSize(f.bytes, f.mime)
    } catch {
      useUi.getState().toast(`“${f.name}” could not be read as an image.`, 'error')
      continue
    }
    const maxW = page.width * 0.6
    const maxH = page.height * 0.6
    const scale = Math.min(1, maxW / size.w, maxH / size.h)
    const w = Math.max(8, size.w * scale)
    const h = Math.max(8, size.h * scale)
    const asset = makeAsset(f.bytes, f.mime, f.name)
    const r = at ? { x: at.x - w / 2, y: at.y - h / 2 } : centeredRect(w, h)
    assets.push(asset)
    objects.push({ id: newId('o'), type: 'image', x: r.x + offset, y: r.y + offset, w, h, assetId: asset.id, opacity: 1, name: f.name })
    offset += 24
  }
  if (objects.length) {
    addObjects(objects, objects.length > 1 ? 'Insert images' : 'Insert image', true, assets)
    useUi.getState().setTool('select')
  }
}

export function createTextObject(x: number, y: number, w?: number): TextObject {
  const t = useSettings.getState().settings.drawing.text
  const obj: TextObject = {
    id: newId('o'),
    type: 'text',
    x,
    y,
    w: w ?? Math.max(240, t.fontSize * 12),
    h: 0,
    text: '',
    fontFamily: t.fontFamily,
    fontSize: t.fontSize,
    color: t.color,
    bold: t.bold,
    italic: t.italic,
    underline: t.underline,
    align: t.align,
    background: null
  }
  return relayout(obj)
}

export function insertTextAt(text: string, at?: { x: number; y: number }): void {
  const obj = createTextObject(0, 0)
  const lines = text.split('\n')
  const longest = Math.max(...lines.map((l) => canvasMeasure(`${obj.fontSize}px sans-serif`, l)))
  obj.w = Math.min(getCurrentPage().width * 0.8, Math.max(200, longest + 40))
  obj.text = text
  const sized = relayout(obj)
  const r = at ? { x: at.x, y: at.y } : centeredRect(sized.w, sized.h)
  addObjects([{ ...sized, x: r.x, y: r.y }], 'Paste text')
}

export function makeMathObject(latex: string, color: string, fontSize: number, x: number, y: number, id?: Id): MathObject {
  const r = renderMath(latex, color, fontSize)
  return { id: id ?? newId('o'), type: 'math', x, y, w: r.width, h: r.height, latex, color, fontSize }
}

export function createTable(rows: number, cols: number): TableObject {
  const t = useSettings.getState().settings.drawing.text
  const colW = 180
  const rowH = 56
  return {
    id: newId('o'),
    type: 'table',
    x: 0,
    y: 0,
    colWidths: Array(cols).fill(colW),
    rowHeights: Array(rows).fill(rowH),
    cells: Array.from({ length: rows }, () => Array(cols).fill('')),
    stroke: '#55606E',
    strokeWidth: 2,
    fill: '#FFFFFF',
    headerFill: '#E3F1EE',
    color: '#1E2228',
    fontFamily: t.fontFamily,
    fontSize: 24
  }
}

export function insertTable(rows: number, cols: number): void {
  const t = createTable(rows, cols)
  const w = t.colWidths.reduce((a, b) => a + b, 0)
  const h = t.rowHeights.reduce((a, b) => a + b, 0)
  const r = centeredRect(w, h)
  addObjects([{ ...t, x: r.x, y: r.y }], 'Insert table')
  useUi.getState().setTool('select')
}

export function tableEdit(id: Id, label: string, fn: (t: TableObject) => TableObject): void {
  updateObjects([id], label, (o) => (o.type === 'table' ? fn(o) : o))
}

export function tableInsertRow(t: TableObject, at: number): TableObject {
  const rows = t.cells.slice()
  rows.splice(at, 0, Array(t.colWidths.length).fill(''))
  const heights = t.rowHeights.slice()
  heights.splice(at, 0, t.rowHeights[Math.min(at, t.rowHeights.length - 1)] ?? 56)
  return { ...t, cells: rows, rowHeights: heights }
}

export function tableInsertCol(t: TableObject, at: number): TableObject {
  const widths = t.colWidths.slice()
  widths.splice(at, 0, t.colWidths[Math.min(at, t.colWidths.length - 1)] ?? 180)
  return { ...t, colWidths: widths, cells: t.cells.map((r) => { const c = r.slice(); c.splice(at, 0, ''); return c }) }
}

export function tableDeleteRow(t: TableObject, at: number): TableObject {
  if (t.rowHeights.length <= 1) return t
  return { ...t, cells: t.cells.filter((_, i) => i !== at), rowHeights: t.rowHeights.filter((_, i) => i !== at) }
}

export function tableDeleteCol(t: TableObject, at: number): TableObject {
  if (t.colWidths.length <= 1) return t
  return { ...t, colWidths: t.colWidths.filter((_, i) => i !== at), cells: t.cells.map((r) => r.filter((_, i) => i !== at)) }
}

// ---------------------------------------------------------------------------
// Pages and sections

/** New pages take the current page's size and the lesson's default background. */
export function addPage(): void {
  const s = docState()
  const cur = currentPage(s)
  const page = createPage({ width: cur.width, height: cur.height, background: s.doc.pageDefaults.background })
  s.commit(
    'Add page',
    (d) => {
      const loc = locatePage(d as LessonDocument, s.pageId)
      if (loc) d.sections[loc.sectionIndex].pages.splice(loc.pageIndex + 1, 0, page as Draft<Page>)
      else d.sections[d.sections.length - 1].pages.push(page as Draft<Page>)
    },
    { pageId: page.id, select: [] }
  )
}

export function addPageToSection(sectionId: Id): void {
  const s = docState()
  const cur = currentPage(s)
  const page = createPage({ width: cur.width, height: cur.height, background: s.doc.pageDefaults.background })
  s.commit(
    'Add page',
    (d) => {
      const sec = d.sections.find((x) => x.id === sectionId)
      sec?.pages.push(page as Draft<Page>)
    },
    { pageId: page.id, select: [] }
  )
}

export function duplicatePage(pageId: Id = docState().pageId): void {
  const s = docState()
  const loc = locatePage(s.doc, pageId)
  if (!loc) return
  const copy = clonePage(s.doc.sections[loc.sectionIndex].pages[loc.pageIndex])
  s.commit(
    'Duplicate page',
    (d) => {
      d.sections[loc.sectionIndex].pages.splice(loc.pageIndex + 1, 0, copy as Draft<Page>)
    },
    { pageId: copy.id, select: [] }
  )
}

export function deletePage(pageId: Id = docState().pageId): boolean {
  const s = docState()
  if (pageCount(s.doc) <= 1) {
    useUi.getState().toast('A lesson needs at least one page.', 'info')
    return false
  }
  const loc = locatePage(s.doc, pageId)
  if (!loc) return false
  const nextPage = allPages(s.doc)[loc.globalIndex + 1] ?? allPages(s.doc)[loc.globalIndex - 1]
  const target = pageId === s.pageId ? nextPage.id : s.pageId
  return s.commit('Delete page', (d) => void deletePageData(d as LessonDocument, pageId), { pageId: target, select: [] })
}

export function movePage(pageId: Id, sectionId: Id, index: number): void {
  docState().commit('Move page', (d) => void movePageData(d as LessonDocument, pageId, sectionId, index))
}

export function addSection(): void {
  const s = docState()
  const cur = currentPage(s)
  const loc = locatePage(s.doc, s.pageId)
  const page = createPage({ width: cur.width, height: cur.height, background: s.doc.pageDefaults.background })
  const n = s.doc.sections.length + 1
  s.commit(
    'Add section',
    (d) => void addSectionData(d as LessonDocument, `Section ${n}`, loc ? d.sections[loc.sectionIndex].id : null, page),
    { pageId: page.id, select: [] }
  )
}

export function renameSection(sectionId: Id, name: string): void {
  const clean = name.trim().slice(0, 120)
  if (!clean) return
  docState().commit('Rename section', (d) => {
    const s = d.sections.find((x) => x.id === sectionId)
    if (s && s.name !== clean) s.name = clean
  })
}

export function deleteSection(sectionId: Id, keepPages: boolean): boolean {
  const s = docState()
  const ok = s.commit(keepPages ? 'Remove section' : 'Delete section', (d) => void removeSection(d as LessonDocument, sectionId, keepPages))
  if (!ok) useUi.getState().toast('This section cannot be removed (a lesson needs at least one section and one page).', 'info')
  return ok
}

export function moveSection(sectionId: Id, delta: -1 | 1): void {
  docState().commit('Move section', (d) => void moveSectionData(d as LessonDocument, sectionId, delta))
}

export function toggleSectionCollapsed(sectionId: Id): void {
  // Collapsing is a view preference stored with the lesson; it is not an undoable edit.
  const s = docState()
  const idx = s.doc.sections.findIndex((x) => x.id === sectionId)
  if (idx < 0) return
  const sections = s.doc.sections.slice()
  sections[idx] = { ...sections[idx], collapsed: !sections[idx].collapsed }
  useDoc.setState({ doc: { ...s.doc, sections } })
}

export type Scope = 'page' | 'section' | 'all'

function pagesInScope(doc: LessonDocument, pageId: Id, scope: Scope): Set<Id> {
  if (scope === 'all') return new Set(allPages(doc).map((p) => p.id))
  if (scope === 'section') {
    const loc = locatePage(doc, pageId)
    return new Set(loc ? doc.sections[loc.sectionIndex].pages.map((p) => p.id) : [pageId])
  }
  return new Set([pageId])
}

export function backgroundRecipe(patch: Partial<Background>, scope: Scope, asset?: Asset): Recipe {
  const s = docState()
  const ids = pagesInScope(s.doc, s.pageId, scope)
  return (d) => {
    if (asset) d.assets[asset.id] = asset as Draft<Asset>
    for (const sec of d.sections) for (const p of sec.pages) if (ids.has(p.id)) Object.assign(p.background, patch)
    if (scope === 'all') Object.assign(d.pageDefaults.background, patch)
  }
}

export function setBackground(patch: Partial<Background>, scope: Scope = 'page', asset?: Asset): void {
  docState().commit('Change background', backgroundRecipe(patch, scope, asset))
}

/** Live preview while dragging a slider; call docState().end() when done. */
export function previewBackground(patch: Partial<Background>, scope: Scope): void {
  docState().transient(backgroundRecipe(patch, scope))
}

export function setLessonDefaultBackground(bg: Background): void {
  docState().commit('Set default background', (d) => {
    d.pageDefaults.background = { ...bg }
  })
}

export function setPageSize(width: number, height: number, scope: Scope = 'page', scaleContent = false): void {
  const s = docState()
  const ids = pagesInScope(s.doc, s.pageId, scope)
  s.commit('Change page size', (d) => {
    for (const sec of d.sections) {
      for (const p of sec.pages) {
        if (!ids.has(p.id)) continue
        if (scaleContent && (p.width !== width || p.height !== height)) {
          const k = Math.min(width / p.width, height / p.height)
          const from = { x: 0, y: 0, w: 1, h: 1 }
          const to = { x: 0, y: 0, w: k, h: k }
          p.objects = (p.objects as BoardObject[]).map((o) => relayout(scaleObject(o, from, to))) as Draft<BoardObject>[]
        }
        p.width = width
        p.height = height
      }
    }
    if (scope === 'all') {
      d.pageDefaults.width = width
      d.pageDefaults.height = height
    }
  })
}


export function clearPage(): void {
  const s = docState()
  if (!currentPage(s).objects.length) return
  s.commit(
    'Clear page',
    onPage(s.pageId, (p) => {
      p.objects = []
    }),
    { select: [] }
  )
}

export function setTitle(title: string): void {
  const clean = title.trim().slice(0, 200) || 'Untitled Lesson'
  docState().commit('Rename lesson', (d) => {
    if (d.title !== clean) d.title = clean
  })
}

export function goRelative(delta: number): void {
  const s = docState()
  const loc = locatePage(s.doc, s.pageId)
  if (loc) s.goToIndex(loc.globalIndex + delta)
}

export { translateObjectData }
