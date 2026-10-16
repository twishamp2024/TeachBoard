/**
 * The contract between the main process and the renderer. The preload script
 * exposes exactly this surface as `window.teachboard`; nothing else from Node
 * or Electron is reachable from the renderer.
 */
import appConfig from '../../app.config.json'

export const APP = appConfig

export type PlatformName = 'win32' | 'darwin' | 'linux'

export interface FileFilter {
  name: string
  extensions: string[]
}

export interface OpenedFile {
  path: string
  name: string
  bytes: Uint8Array
}

export interface PickedFile {
  name: string
  mime: string
  bytes: Uint8Array
}

export interface RecentFile {
  path: string
  name: string
  openedAt: number
}

export interface RecoveryEntry {
  id: string
  title: string
  originalPath: string | null
  savedAt: number
}

export interface PrintPage {
  png: Uint8Array
  width: number
  height: number
}

export type UnsavedChoice = 'save' | 'discard' | 'cancel'

/** A menu item's accelerator as an Electron accelerator string, keyed by command id. */
export type AcceleratorMap = Record<string, string | undefined>

export interface MenuState {
  accelerators: AcceleratorMap
  canUndo: boolean
  canRedo: boolean
  hasSelection: boolean
}

export interface TeachBoardApi {
  platform: PlatformName
  appName: string
  appVersion: string
  isE2E: boolean

  // Documents
  openDocument(path?: string): Promise<OpenedFile | null>
  saveDocument(args: { path: string | null; bytes: Uint8Array; suggestedName: string }): Promise<string | null>
  confirmUnsaved(docName: string): Promise<UnsavedChoice>
  getPathForFile(file: File): string

  // Import / export
  pickFiles(kind: 'image' | 'pdf' | 'library'): Promise<PickedFile[]>
  saveExport(args: { bytes: Uint8Array; defaultName: string; filters: FileFilter[] }): Promise<string | null>
  saveExportMany(args: { files: { name: string; bytes: Uint8Array }[] }): Promise<string | null>
  printPages(args: { pages: PrintPage[]; title: string }): Promise<boolean>
  showItemInFolder(path: string): void

  // Recent files
  listRecent(): Promise<RecentFile[]>
  clearRecent(): Promise<void>

  // Persistent JSON stores in the app-data directory
  readStore(name: 'settings' | 'resources' | 'ui'): Promise<unknown>
  writeStore(name: 'settings' | 'resources' | 'ui', value: unknown): Promise<void>

  // Crash recovery
  writeRecovery(entry: RecoveryEntry, bytes: Uint8Array): Promise<void>
  listRecovery(): Promise<RecoveryEntry[]>
  readRecovery(id: string): Promise<Uint8Array | null>
  clearRecovery(id: string): Promise<void>

  // Window
  setTitle(title: string): void
  setFullScreen(on: boolean): Promise<boolean>
  setTheme(theme: { dark: boolean; surface: string; symbol: string }): void
  updateMenu(state: MenuState): void
  popupAppMenu(x: number, y: number): void
  closeConfirmed(): void

  // Events from the main process. Each returns an unsubscribe function.
  onMenuCommand(cb: (command: string, arg?: string) => void): () => void
  onOpenFile(cb: (path: string) => void): () => void
  onRequestClose(cb: () => void): () => void
  onFullScreenChanged(cb: (on: boolean) => void): () => void
}

export const IPC = {
  openDocument: 'doc:open',
  saveDocument: 'doc:save',
  confirmUnsaved: 'dialog:confirm-unsaved',
  pickFiles: 'import:pick',
  saveExport: 'export:save',
  saveExportMany: 'export:save-many',
  printPages: 'print:pages',
  showItemInFolder: 'shell:show-item',
  listRecent: 'recent:list',
  clearRecent: 'recent:clear',
  readStore: 'store:read',
  writeStore: 'store:write',
  writeRecovery: 'recovery:write',
  listRecovery: 'recovery:list',
  readRecovery: 'recovery:read',
  clearRecovery: 'recovery:clear',
  setTitle: 'window:set-title',
  setFullScreen: 'window:set-fullscreen',
  setTheme: 'window:set-theme',
  updateMenu: 'menu:update',
  popupAppMenu: 'menu:popup',
  closeConfirmed: 'app:close-confirmed',
  // main → renderer
  menuCommand: 'menu:command',
  openFile: 'app:open-file',
  requestClose: 'app:request-close',
  fullScreenChanged: 'window:fullscreen-changed'
} as const
