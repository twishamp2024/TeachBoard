import { create } from 'zustand'
import type { Id, TextObject } from '../core/model'
import type { Viewport } from '../core/viewport'

export type ToolId = 'select' | 'pan' | 'pen' | 'highlighter' | 'eraser' | 'shape' | 'line' | 'polygon' | 'text' | 'math' | 'laser'

export type DrawerId = 'background' | 'resources' | null

export type DialogState =
  | { kind: 'settings'; tab?: string }
  | { kind: 'math'; editId?: Id; at?: { x: number; y: number } }
  | { kind: 'export'; format: 'pdf' | 'png' | 'jpeg' | 'png-all' }
  | { kind: 'pageSetup' }
  | { kind: 'shortcuts' }
  | { kind: 'about' }
  | { kind: 'table' }
  | { kind: 'recovery' }
  | { kind: 'saveToLibrary' }
  | { kind: 'confirm'; title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void }
  | { kind: 'prompt'; title: string; label: string; value: string; submitLabel: string; onSubmit: (value: string) => void }
  | null

export type WidgetId = 'timer' | 'calculator' | 'ruler' | 'protractor' | 'magnifier' | 'spotlight' | 'shade' | 'picker'

export interface Toast {
  id: number
  message: string
  kind: 'info' | 'success' | 'error'
  action?: { label: string; run: () => void }
}

/** In-progress inline text editing (the object is committed on finish). */
export interface TextEditState {
  draft: TextObject
  isNew: boolean
}

export interface CellEditState {
  tableId: Id
  row: number
  col: number
}

/** Geometry instruments live in page coordinates. */
export interface InstrumentState {
  x: number
  y: number
  angle: number
  length: number
}

interface UiStore {
  tool: ToolId
  previousTool: ToolId
  drawer: DrawerId
  drawerPinned: boolean
  drawerWidth: number
  pagesOpen: boolean
  pagesWidth: number
  dialog: DialogState
  textEdit: TextEditState | null
  cellEdit: CellEditState | null
  /** Per-page viewports; `fit` means the page is kept fitted to the window on resize. */
  viewports: Record<Id, Viewport & { fit?: boolean }>
  viewSize: { w: number; h: number }
  fullScreen: boolean
  widgets: WidgetId[]
  ruler: InstrumentState
  protractor: InstrumentState
  presenting: { startPageId: Id } | null
  toasts: Toast[]
  busy: string | null
  dark: boolean
  pointer: { x: number; y: number; inside: boolean }

  setTool(t: ToolId): void
  setDrawer(d: DrawerId): void
  toggleDrawer(d: Exclude<DrawerId, null>): void
  set(patch: Partial<UiStore>): void
  openDialog(d: DialogState): void
  closeDialog(): void
  setViewport(pageId: Id, v: Viewport & { fit?: boolean }): void
  toggleWidget(w: WidgetId): void
  closeWidget(w: WidgetId): void
  toast(message: string, kind?: Toast['kind'], action?: Toast['action']): void
  dismissToast(id: number): void
}

let toastId = 0

export const useUi = create<UiStore>((set, get) => ({
  tool: 'pen',
  previousTool: 'select',
  drawer: null,
  drawerPinned: false,
  drawerWidth: 320,
  pagesOpen: true,
  pagesWidth: 212,
  dialog: null,
  textEdit: null,
  cellEdit: null,
  viewports: {},
  viewSize: { w: 800, h: 600 },
  fullScreen: false,
  widgets: [],
  ruler: { x: 640, y: 820, angle: 0, length: 900 },
  protractor: { x: 1500, y: 620, angle: 0, length: 520 },
  presenting: null,
  toasts: [],
  busy: null,
  dark: false,
  pointer: { x: 0, y: 0, inside: false },

  setTool(t) {
    const cur = get().tool
    if (cur === t) return
    set({ tool: t, previousTool: cur })
  },
  setDrawer(d) {
    set({ drawer: d })
  },
  toggleDrawer(d) {
    set({ drawer: get().drawer === d ? null : d })
  },
  set(patch) {
    set(patch)
  },
  openDialog(d) {
    set({ dialog: d })
  },
  closeDialog() {
    set({ dialog: null })
  },
  setViewport(pageId, v) {
    set({ viewports: { ...get().viewports, [pageId]: v } })
  },
  toggleWidget(w) {
    const ws = get().widgets
    set({ widgets: ws.includes(w) ? ws.filter((x) => x !== w) : [...ws, w] })
  },
  closeWidget(w) {
    set({ widgets: get().widgets.filter((x) => x !== w) })
  },
  toast(message, kind = 'info', action) {
    const id = ++toastId
    set({ toasts: [...get().toasts.slice(-3), { id, message, kind, action }] })
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 7000 : action ? 6000 : 3200)
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  }
}))
