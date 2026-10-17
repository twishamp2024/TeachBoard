import type { Draft } from 'immer'
import { allPages, createDocument, createPage, createSection, locatePage, newId } from '../core/document'
import { canvasToBytes, exportPdf, rasterizePage, safeFileName, safeScale } from '../core/exporter'
import type { Asset, LessonDocument, Page } from '../core/model'
import { renderPageToCanvas } from '../core/render'
import { ensureFontsLoaded, resources } from '../core/resources'
import { deserializeLesson, LessonFormatError, serializeLesson } from '../core/serialization'
import { api, APP_NAME, APP_VERSION, DOC_EXTENSION } from '../platform'
import { currentPage, isDirty, useDoc } from './doc'
import { useSettings } from './settings'
import { useUi } from './ui'

const DEFAULT_TITLE = 'Untitled Lesson'

function toast(message: string, kind: 'info' | 'success' | 'error' = 'info') {
  useUi.getState().toast(message, kind)
}

function errorMessage(err: unknown): string {
  if (err instanceof LessonFormatError) return err.message
  const msg = err instanceof Error ? err.message : String(err)
  // Strip Electron's IPC wrapper text.
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

async function withBusy<T>(label: string, fn: () => Promise<T>): Promise<T> {
  useUi.getState().set({ busy: label })
  try {
    return await fn()
  } finally {
    useUi.getState().set({ busy: null })
  }
}

function baseName(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path
  return name.replace(new RegExp(`\\.${DOC_EXTENSION}$`, 'i'), '')
}

async function previewPng(doc: LessonDocument): Promise<Uint8Array | null> {
  try {
    const page = allPages(doc)[0]
    await resources.ensurePages(doc, [page])
    const canvas = renderPageToCanvas(page, { doc, resources }, 480 / Math.max(page.width, page.height))
    return await canvasToBytes(canvas, 'image/png')
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Save / open / new

let saveInProgress: Promise<boolean> | null = null

/**
 * Saves the lesson (asking for a location when needed). Saves never overlap:
 * a request made while one is running joins it instead of starting another.
 */
export function saveDocument(saveAs = false): Promise<boolean> {
  if (!saveInProgress) {
    saveInProgress = runSave(saveAs).finally(() => {
      saveInProgress = null
    })
  }
  return saveInProgress
}

async function runSave(saveAs: boolean): Promise<boolean> {
  const start = useDoc.getState()
  if (start.txBase) start.end('Edit')
  const s = useDoc.getState()
  let docToSave: LessonDocument = { ...s.doc, modifiedAt: new Date().toISOString() }
  try {
    const preview = await previewPng(docToSave)
    let bytes = serializeLesson(docToSave, { appName: APP_NAME, appVersion: APP_VERSION, preview })
    const target = saveAs ? null : s.filePath
    let path = await api.saveDocument({ path: target, bytes, suggestedName: safeFileName(docToSave.title) })
    if (!path) return false
    // A first save names an untitled lesson after its file.
    if (!target && docToSave.title === DEFAULT_TITLE) {
      docToSave = { ...docToSave, title: baseName(path) }
      bytes = serializeLesson(docToSave, { appName: APP_NAME, appVersion: APP_VERSION, preview })
      path = (await api.saveDocument({ path, bytes, suggestedName: docToSave.title })) ?? path
    }
    const now = useDoc.getState()
    if (now.doc === s.doc) useDoc.setState({ doc: docToSave, savedDoc: docToSave, filePath: path })
    else useDoc.setState({ savedDoc: docToSave, filePath: path })
    api.clearRecovery(docToSave.id).catch(() => undefined)
    toast(`Saved “${baseName(path)}”`, 'success')
    return true
  } catch (err) {
    toast(`Could not save the lesson: ${errorMessage(err)}`, 'error')
    return false
  }
}

/** Asks to save unsaved changes. Resolves false when the user cancels. */
export async function maybeSaveChanges(): Promise<boolean> {
  const s = useDoc.getState()
  if (s.txBase) s.end('Edit')
  if (!isDirty(useDoc.getState())) return true
  const choice = await api.confirmUnsaved(useDoc.getState().doc.title)
  if (choice === 'cancel') return false
  if (choice === 'save') return saveDocument(false)
  api.clearRecovery(useDoc.getState().doc.id).catch(() => undefined)
  return true
}

export function freshDocument(): LessonDocument {
  const st = useSettings.getState().settings
  return createDocument({ width: st.pageSize.width, height: st.pageSize.height, background: { ...st.background } }, DEFAULT_TITLE)
}

export async function newDocument(): Promise<void> {
  if (!(await maybeSaveChanges())) return
  loadDoc(freshDocument(), null, true)
}

function loadDoc(doc: LessonDocument, path: string | null, saved: boolean): void {
  useUi.getState().set({ textEdit: null, cellEdit: null, viewports: {} })
  useDoc.getState().reset(doc, path, saved)
  resources.prune(doc)
}

export function openBytes(bytes: Uint8Array, path: string | null): boolean {
  try {
    const { doc, warnings } = deserializeLesson(bytes)
    loadDoc(doc, path, !!path)
    if (warnings.length) toast(`Opened with problems: ${warnings.slice(0, 2).join(' ')}`, 'error')
    else toast(`Opened “${path ? baseName(path) : doc.title}”`, 'success')
    return true
  } catch (err) {
    toast(`Could not open the lesson. ${errorMessage(err)}`, 'error')
    return false
  }
}

export async function openDocument(path?: string): Promise<void> {
  if (!(await maybeSaveChanges())) return
  try {
    const file = await api.openDocument(path)
    if (!file) return
    await withBusy('Opening lesson…', async () => {
      openBytes(file.bytes, file.path)
    })
  } catch (err) {
    toast(`Could not open the file. ${errorMessage(err)}`, 'error')
  }
}

// ---------------------------------------------------------------------------
// Crash recovery

let lastRecoveredRevision = -1
let recoveryTimer: ReturnType<typeof setInterval> | null = null

export async function writeRecoveryNow(): Promise<void> {
  const s = useDoc.getState()
  if (!useSettings.getState().settings.recovery || !isDirty(s) || s.revision === lastRecoveredRevision) return
  lastRecoveredRevision = s.revision
  try {
    const bytes = serializeLesson(s.doc, { appName: APP_NAME, appVersion: APP_VERSION })
    await api.writeRecovery({ id: s.doc.id, title: s.doc.title, originalPath: s.filePath, savedAt: Date.now() }, bytes)
  } catch (err) {
    console.warn('Recovery snapshot failed', err)
  }
}

export function startRecoveryLoop(intervalMs = 30_000): void {
  if (recoveryTimer) clearInterval(recoveryTimer)
  recoveryTimer = setInterval(() => void writeRecoveryNow(), intervalMs)
}

export async function restoreRecovery(id: string): Promise<void> {
  const bytes = await api.readRecovery(id)
  if (!bytes) {
    toast('That recovered lesson is no longer available.', 'error')
    return
  }
  try {
    const { doc } = deserializeLesson(bytes)
    // Recovered work opens as an unsaved copy so it can never silently overwrite a file.
    const copy: LessonDocument = { ...doc, id: newId('d'), title: `${doc.title} (Recovered)` }
    loadDoc(copy, null, false)
    await api.clearRecovery(id)
    toast('Recovered lesson opened. Save it to keep your work.', 'success')
  } catch (err) {
    toast(`Could not recover the lesson. ${errorMessage(err)}`, 'error')
  }
}

// ---------------------------------------------------------------------------
// Export & print

export type PageRange = 'current' | 'section' | 'all'

export function pagesInRange(range: PageRange): Page[] {
  const s = useDoc.getState()
  if (range === 'current') return [currentPage(s)]
  if (range === 'section') {
    const loc = locatePage(s.doc, s.pageId)
    return loc ? s.doc.sections[loc.sectionIndex].pages : [currentPage(s)]
  }
  return allPages(s.doc)
}

export async function exportAsPdf(range: PageRange, scale: number): Promise<void> {
  const s = useDoc.getState()
  const pages = pagesInRange(range)
  try {
    const bytes = await withBusy('Exporting PDF…', async () => {
      await ensureFontsLoaded()
      return exportPdf(s.doc, pages, resources, scale, `${APP_NAME} ${APP_VERSION}`, (done, total) =>
        useUi.getState().set({ busy: `Exporting PDF… ${done}/${total}` })
      )
    })
    const path = await api.saveExport({
      bytes,
      defaultName: `${safeFileName(s.doc.title)}.pdf`,
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
    })
    if (path) toast(`Exported ${pages.length} page${pages.length === 1 ? '' : 's'} to PDF`, 'success')
  } catch (err) {
    toast(`PDF export failed: ${errorMessage(err)}`, 'error')
  }
}

export async function exportAsImage(format: 'png' | 'jpeg', range: PageRange, scale: number): Promise<void> {
  const s = useDoc.getState()
  const pages = pagesInRange(range)
  const mime = format === 'png' ? 'image/png' : 'image/jpeg'
  const ext = format === 'png' ? 'png' : 'jpg'
  const all = allPages(s.doc)
  try {
    const files = await withBusy('Exporting images…', async () => {
      const out: { name: string; bytes: Uint8Array }[] = []
      for (const p of pages) {
        const raster = await rasterizePage(s.doc, p, resources, scale, mime)
        const n = all.findIndex((x) => x.id === p.id) + 1
        out.push({ name: `${safeFileName(s.doc.title)} - page ${n}.${ext}`, bytes: raster.bytes })
      }
      return out
    })
    let path: string | null
    if (files.length === 1) {
      path = await api.saveExport({
        bytes: files[0].bytes,
        defaultName: files[0].name,
        filters: [{ name: format === 'png' ? 'PNG Image' : 'JPEG Image', extensions: format === 'png' ? ['png'] : ['jpg', 'jpeg'] }]
      })
    } else {
      path = await api.saveExportMany({ files })
    }
    if (path) toast(`Exported ${files.length} image${files.length === 1 ? '' : 's'}`, 'success')
  } catch (err) {
    toast(`Image export failed: ${errorMessage(err)}`, 'error')
  }
}

export async function printDocument(range: PageRange = 'all'): Promise<void> {
  const s = useDoc.getState()
  const pages = pagesInRange(range)
  try {
    const printPages = await withBusy('Preparing to print…', async () => {
      await ensureFontsLoaded()
      const out = []
      for (const p of pages) {
        const r = await rasterizePage(s.doc, p, resources, safeScale(p, 2), 'image/png')
        out.push({ png: r.bytes, width: p.width, height: p.height })
      }
      return out
    })
    await api.printPages({ pages: printPages, title: s.doc.title })
  } catch (err) {
    toast(`Printing failed: ${errorMessage(err)}`, 'error')
  }
}

// ---------------------------------------------------------------------------
// PDF import

export async function importPdfFile(file?: { name: string; bytes: Uint8Array }): Promise<void> {
  let picked = file
  if (!picked) {
    const files = await api.pickFiles('pdf')
    picked = files[0]
  }
  if (!picked) return
  const source = picked
  try {
    const { importPdf } = await import('../core/pdfImport')
    const imported = await withBusy('Importing PDF…', () =>
      importPdf(source.bytes, { onProgress: (d, t) => useUi.getState().set({ busy: `Importing PDF… ${d}/${t}` }) })
    )
    if (!imported.length) {
      toast('The PDF has no pages.', 'error')
      return
    }
    const s = useDoc.getState()
    const assets: Asset[] = []
    const pages: Page[] = imported.map((ip, i) => {
      const asset: Asset = { id: newId('a'), mime: ip.mime, name: `${source.name} p${i + 1}`, data: ip.image }
      assets.push(asset)
      const page = createPage({
        width: ip.width,
        height: ip.height,
        background: { ...s.doc.pageDefaults.background, color: '#FFFFFF', pattern: 'none', imageAssetId: asset.id, imageFit: 'stretch' }
      })
      return page
    })
    const section = createSection(source.name.replace(/\.pdf$/i, '').slice(0, 80) || 'Imported PDF', pages)
    const loc = locatePage(s.doc, s.pageId)
    s.commit(
      'Import PDF',
      (d) => {
        for (const a of assets) d.assets[a.id] = a as Draft<Asset>
        d.sections.splice((loc?.sectionIndex ?? d.sections.length - 1) + 1, 0, section as Draft<typeof section>)
      },
      { pageId: pages[0].id, select: [] }
    )
    toast(`Imported ${pages.length} page${pages.length === 1 ? '' : 's'} from “${source.name}”`, 'success')
  } catch (err) {
    toast(`Could not import the PDF: ${errorMessage(err)}`, 'error')
  }
}
