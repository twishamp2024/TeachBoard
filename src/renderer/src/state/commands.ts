import { pageCount } from '../core/document'
import { api } from '../platform'
import { finishTextEdit } from '../tools/textTools'
import { copySelection, paste } from './clipboard'
import { currentPage, useDoc } from './doc'
import { exportAsImage, importPdfFile, newDocument, openDocument, printDocument, saveDocument } from './files'
import {
  addPage,
  addSection,
  clearPage,
  deletePage,
  deleteSelection,
  duplicatePage,
  duplicateSelection,
  goRelative,
  insertImages,
  reorderSelection,
  selectAll
} from './ops'
import { useSettings } from './settings'
import { useUi, type ToolId, type WidgetId } from './ui'
import { fitView, zoomActual, zoomStep } from './view'

/** True when keyboard focus is in a text field (commands then defer to native editing). */
export function isEditingText(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA') return true
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type
    return ['text', 'search', 'number', 'email', 'url', 'password', 'tel'].includes(type)
  }
  return el.isContentEditable
}

/** Text-editing commands that should act on a focused text field instead of the board. */
const NATIVE_TEXT_COMMANDS: Record<string, string> = {
  'edit.undo': 'undo',
  'edit.redo': 'redo',
  'edit.cut': 'cut',
  'edit.copy': 'copy',
  'edit.selectAll': 'selectAll',
  'edit.delete': 'delete'
}

export function setTool(t: ToolId): void {
  if (useUi.getState().textEdit) finishTextEdit()
  useUi.getState().set({ cellEdit: null })
  useUi.getState().setTool(t)
  if (t !== 'select') useDoc.getState().setSelection([])
}

export function startPresentation(fromStart: boolean): void {
  if (useUi.getState().textEdit) finishTextEdit()
  const s = useDoc.getState()
  const start = fromStart ? s.doc.sections.flatMap((x) => x.pages)[0].id : s.pageId
  useUi.getState().set({ presenting: { startPageId: start }, cellEdit: null })
}

function confirmDeletePage(): void {
  const s = useDoc.getState()
  if (pageCount(s.doc) <= 1) {
    useUi.getState().toast('A lesson needs at least one page.')
    return
  }
  const page = currentPage(s)
  if (useSettings.getState().settings.confirmPageDelete && page.objects.length > 0) {
    useUi.getState().openDialog({
      kind: 'confirm',
      title: 'Delete this page?',
      message: 'The page and everything on it will be removed. You can undo this.',
      confirmLabel: 'Delete Page',
      danger: true,
      onConfirm: () => deletePage(page.id)
    })
  } else deletePage(page.id)
}

export async function insertImageFromDisk(): Promise<void> {
  try {
    const files = await api.pickFiles('image')
    if (files.length) await insertImages(files)
  } catch (err) {
    useUi.getState().toast(`Could not insert the image: ${err instanceof Error ? err.message : err}`, 'error')
  }
}

export function runCommand(id: string, arg?: string): void {
  const ui = useUi.getState()
  const doc = useDoc.getState()

  if (isEditingText() && NATIVE_TEXT_COMMANDS[id]) {
    document.execCommand(NATIVE_TEXT_COMMANDS[id])
    return
  }
  if (isEditingText() && id === 'edit.paste') {
    navigator.clipboard
      .readText()
      .then((t) => document.execCommand('insertText', false, t))
      .catch(() => undefined)
    return
  }

  if (id.startsWith('tool.')) {
    setTool(id.slice(5) as ToolId)
    return
  }
  if (id.startsWith('teach.')) {
    ui.toggleWidget(id.slice(6) as WidgetId)
    return
  }

  switch (id) {
    case 'file.new':
      void newDocument()
      break
    case 'file.open':
      void openDocument()
      break
    case 'file.openRecent':
      if (arg) void openDocument(arg)
      break
    case 'file.clearRecent':
      void api.clearRecent()
      break
    case 'file.save':
      if (ui.textEdit) finishTextEdit()
      void saveDocument(false)
      break
    case 'file.saveAs':
      if (ui.textEdit) finishTextEdit()
      void saveDocument(true)
      break
    case 'file.importPdf':
      void importPdfFile()
      break
    case 'file.exportPdf':
      ui.openDialog({ kind: 'export', format: 'pdf' })
      break
    case 'file.exportPng':
      ui.openDialog({ kind: 'export', format: 'png' })
      break
    case 'file.exportJpeg':
      ui.openDialog({ kind: 'export', format: 'jpeg' })
      break
    case 'file.exportAllPng':
      void exportAsImage('png', 'all', 2)
      break
    case 'file.print':
      void printDocument('all')
      break

    case 'edit.undo':
      if (ui.textEdit) finishTextEdit()
      if (!doc.undo()) ui.toast('Nothing to undo')
      break
    case 'edit.redo':
      if (!doc.redo()) ui.toast('Nothing to redo')
      break
    case 'edit.cut':
      void copySelection(true)
      break
    case 'edit.copy':
      void copySelection(false)
      break
    case 'edit.paste':
      void paste()
      break
    case 'edit.duplicate':
      duplicateSelection()
      break
    case 'edit.delete':
      deleteSelection()
      break
    case 'edit.selectAll':
      useUi.getState().setTool('select')
      selectAll()
      break
    case 'edit.bringToFront':
      reorderSelection('front')
      break
    case 'edit.bringForward':
      reorderSelection('forward')
      break
    case 'edit.sendBackward':
      reorderSelection('backward')
      break
    case 'edit.sendToBack':
      reorderSelection('back')
      break
    case 'edit.saveToLibrary':
      if (doc.selection.length) ui.openDialog({ kind: 'saveToLibrary' })
      else ui.toast('Select something on the page first.')
      break
    case 'app.settings':
      ui.openDialog({ kind: 'settings' })
      break

    case 'view.zoomIn':
      zoomStep(1)
      break
    case 'view.zoomOut':
      zoomStep(-1)
      break
    case 'view.zoomFit':
      fitView()
      break
    case 'view.zoom100':
      zoomActual()
      break
    case 'view.togglePages':
      ui.set({ pagesOpen: !ui.pagesOpen })
      break
    case 'view.resources':
      ui.toggleDrawer('resources')
      break
    case 'view.present':
      startPresentation(false)
      break
    case 'view.presentFromStart':
      startPresentation(true)
      break
    case 'view.toggleFullScreen':
      void api.setFullScreen(!ui.fullScreen).then((on) => useUi.getState().set({ fullScreen: on }))
      break

    case 'insert.image':
      void insertImageFromDisk()
      break
    case 'insert.table':
      ui.openDialog({ kind: 'table' })
      break
    case 'insert.math':
      ui.openDialog({ kind: 'math' })
      break

    case 'page.new':
      addPage()
      break
    case 'page.duplicate':
      duplicatePage()
      break
    case 'page.delete':
      confirmDeletePage()
      break
    case 'page.prev':
      goRelative(-1)
      break
    case 'page.next':
      goRelative(1)
      break
    case 'page.first':
      doc.goToIndex(0)
      break
    case 'page.last':
      doc.goToIndex(pageCount(doc.doc) - 1)
      break
    case 'section.new':
      addSection()
      break
    case 'page.background':
      ui.toggleDrawer('background')
      break
    case 'page.setup':
      ui.openDialog({ kind: 'pageSetup' })
      break
    case 'page.clear':
      if (currentPage(doc).objects.length)
        ui.openDialog({
          kind: 'confirm',
          title: 'Clear this page?',
          message: 'Everything on this page will be removed. The background stays. You can undo this.',
          confirmLabel: 'Clear Page',
          danger: true,
          onConfirm: clearPage
        })
      break

    case 'help.shortcuts':
      ui.openDialog({ kind: 'shortcuts' })
      break
    case 'help.about':
      ui.openDialog({ kind: 'about' })
      break
    default:
      console.warn('Unknown command', id)
  }
}
