import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, screen, shell } from 'electron'
import { promises as fs, existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { APP, IPC, type FileFilter, type MenuState, type PrintPage, type RecoveryEntry } from '../shared/ipc'
import { buildMenu } from './menu'
import { printPages } from './print'
import { APP_ORIGIN, registerAppScheme, serveRenderer } from './protocol'
import * as storage from './storage'

// Allow tests (and portable setups) to isolate the app-data directory.
if (process.env.TEACHBOARD_USER_DATA) app.setPath('userData', process.env.TEACHBOARD_USER_DATA)
app.setName(APP.appName)
if (process.platform === 'win32') app.setAppUserModelId(APP.appId)
registerAppScheme()

const DEV_URL = process.env.ELECTRON_RENDERER_URL
const isDev = !app.isPackaged && !!DEV_URL
const isE2E = process.env.TEACHBOARD_E2E === '1'
const DOC_EXT = `.${APP.fileExtension}`
const MAX_DOC_BYTES = 1024 * 1024 * 1024
const MAX_IMPORT_BYTES = 300 * 1024 * 1024

let mainWindow: BrowserWindow | null = null
let allowClose = false
let quitting = false
let pendingOpenPath: string | null = findDocArg(process.argv)
let menuState: MenuState = { accelerators: {}, canUndo: false, canRedo: false, hasSelection: false }

if (!isE2E && !app.requestSingleInstanceLock()) {
  app.quit()
}

function findDocArg(argv: string[]): string | null {
  for (const arg of argv.slice(1)) {
    if (arg.toLowerCase().endsWith(DOC_EXT) && existsSync(arg)) return arg
  }
  return null
}

function isDocPath(path: unknown): path is string {
  return typeof path === 'string' && path.toLowerCase().endsWith(DOC_EXT)
}

// ---------------------------------------------------------------------------
// Window state

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

const windowStatePath = () => join(app.getPath('userData'), 'window-state.json')

async function loadWindowState(): Promise<WindowState> {
  const fallback: WindowState = { width: 1360, height: 860, maximized: false }
  try {
    const s = JSON.parse(await fs.readFile(windowStatePath(), 'utf8')) as WindowState
    if (typeof s.width !== 'number' || typeof s.height !== 'number') return fallback
    // Only restore a position that is still on a connected display.
    if (typeof s.x === 'number' && typeof s.y === 'number') {
      const visible = screen.getAllDisplays().some((d) => {
        const b = d.workArea
        return s.x! + 100 > b.x && s.x! < b.x + b.width - 100 && s.y! >= b.y - 10 && s.y! < b.y + b.height - 100
      })
      if (!visible) {
        delete s.x
        delete s.y
      }
    }
    return { ...fallback, ...s }
  } catch {
    return fallback
  }
}

function saveWindowState(win: BrowserWindow): void {
  if (win.isDestroyed() || win.isFullScreen()) return
  const b = win.getNormalBounds()
  const state: WindowState = { ...b, maximized: win.isMaximized() }
  storage.writeFileAtomic(windowStatePath(), JSON.stringify(state)).catch(() => undefined)
}

// ---------------------------------------------------------------------------
// Window

async function createWindow(): Promise<void> {
  const isMac = process.platform === 'darwin'
  const dark = nativeTheme.shouldUseDarkColors
  const state = await loadWindowState()

  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 880,
    minHeight: 560,
    show: false,
    title: APP.appName,
    backgroundColor: dark ? '#14161A' : '#E7EAEE',
    titleBarStyle: 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 16, y: 16 } }
      : { titleBarOverlay: { color: dark ? '#1C1F25' : '#FFFFFF', symbolColor: dark ? '#E6E8EB' : '#1E2228', height: 46 } }),
    icon: process.platform === 'linux' || isDev ? join(__dirname, '../../build/icon.png') : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      additionalArguments: isE2E ? ['--tb-e2e'] : []
    }
  })
  mainWindow = win
  allowClose = false

  if (state.maximized) win.maximize()
  win.once('ready-to-show', () => win.show())

  // Lock down navigation: the renderer may never navigate away or open windows.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith(DEV_URL!) : url.startsWith(APP_ORIGIN)
    if (!allowed) event.preventDefault()
  })
  win.webContents.on('will-attach-webview', (event) => event.preventDefault())

  win.on('close', (event) => {
    saveWindowState(win)
    if (allowClose || win.webContents.isCrashed()) return
    event.preventDefault()
    win.webContents.send(IPC.requestClose)
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  win.on('enter-full-screen', () => win.webContents.send(IPC.fullScreenChanged, true))
  win.on('leave-full-screen', () => win.webContents.send(IPC.fullScreenChanged, false))
  win.webContents.on('render-process-gone', () => {
    allowClose = true
  })
  win.webContents.on('did-finish-load', () => {
    if (pendingOpenPath) {
      win.webContents.send(IPC.openFile, pendingOpenPath)
      pendingOpenPath = null
    }
  })

  await refreshMenu()

  if (isDev) {
    await win.loadURL(DEV_URL!)
  } else {
    await win.loadURL(`${APP_ORIGIN}/index.html`)
  }
}

async function refreshMenu(): Promise<void> {
  const recent = await storage.listRecent()
  Menu.setApplicationMenu(buildMenu(mainWindow, menuState, recent, isDev))
}

// ---------------------------------------------------------------------------
// IPC

function winFrom(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

function asBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value
  throw new Error('Expected binary data')
}

const IMAGE_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml'
}

function registerIpc(): void {
  ipcMain.handle(IPC.openDocument, async (event, requested: unknown) => {
    let path: string | null = null
    if (requested == null) {
      const win = winFrom(event)
      const opts: Electron.OpenDialogOptions = {
        title: 'Open Lesson',
        properties: ['openFile'],
        filters: [{ name: APP.fileDescription, extensions: [APP.fileExtension] }]
      }
      const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      if (res.canceled || !res.filePaths[0]) return null
      path = res.filePaths[0]
    } else if (isDocPath(requested)) {
      path = requested
    } else {
      throw new Error(`Only ${APP.fileDescription} files (*${DOC_EXT}) can be opened.`)
    }
    const stat = await fs.stat(path)
    if (stat.size > MAX_DOC_BYTES) throw new Error('The file is too large to open.')
    const bytes = new Uint8Array(await fs.readFile(path))
    await storage.addRecent(path)
    await refreshMenu()
    return { path, name: basename(path), bytes }
  })

  ipcMain.handle(IPC.saveDocument, async (event, args: { path: string | null; bytes: unknown; suggestedName: string }) => {
    const bytes = asBytes(args.bytes)
    let path = args.path
    if (path && !isDocPath(path)) throw new Error('Invalid document path')
    if (!path) {
      const win = winFrom(event)
      const safeName = String(args.suggestedName || 'Untitled Lesson').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Untitled Lesson'
      const opts: Electron.SaveDialogOptions = {
        title: 'Save Lesson',
        defaultPath: join(app.getPath('documents'), `${safeName}${DOC_EXT}`),
        filters: [{ name: APP.fileDescription, extensions: [APP.fileExtension] }]
      }
      const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
      if (res.canceled || !res.filePath) return null
      path = res.filePath
      if (!path.toLowerCase().endsWith(DOC_EXT)) path += DOC_EXT
    }
    await storage.writeFileAtomic(path, bytes)
    await storage.addRecent(path)
    await refreshMenu()
    return path
  })

  ipcMain.handle(IPC.confirmUnsaved, async (event, docName: string) => {
    const win = winFrom(event)
    const isMac = process.platform === 'darwin'
    const buttons = isMac ? ['Save', 'Cancel', "Don't Save"] : ['Save', "Don't Save", 'Cancel']
    const opts: Electron.MessageBoxOptions = {
      type: 'warning',
      buttons,
      defaultId: 0,
      cancelId: buttons.indexOf('Cancel'),
      noLink: true,
      title: APP.appName,
      message: `Do you want to save the changes you made to “${String(docName).slice(0, 200)}”?`,
      detail: "Your changes will be lost if you don't save them."
    }
    const res = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
    const label = buttons[res.response]
    return label === 'Save' ? 'save' : label === 'Cancel' ? 'cancel' : 'discard'
  })

  ipcMain.handle(IPC.pickFiles, async (event, kind: 'image' | 'pdf' | 'library') => {
    const win = winFrom(event)
    const filters =
      kind === 'pdf'
        ? [{ name: 'PDF Documents', extensions: ['pdf'] }]
        : [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }]
    const opts: Electron.OpenDialogOptions = {
      title: kind === 'pdf' ? 'Import PDF' : 'Choose Images',
      properties: kind === 'pdf' ? ['openFile'] : ['openFile', 'multiSelections'],
      filters
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled) return []
    const out = []
    for (const p of res.filePaths) {
      const stat = await fs.stat(p)
      if (stat.size > MAX_IMPORT_BYTES) throw new Error(`${basename(p)} is too large to import.`)
      const ext = extname(p).toLowerCase()
      out.push({
        name: basename(p),
        mime: ext === '.pdf' ? 'application/pdf' : IMAGE_EXT[ext] ?? 'application/octet-stream',
        bytes: new Uint8Array(await fs.readFile(p))
      })
    }
    return out
  })

  ipcMain.handle(IPC.saveExport, async (event, args: { bytes: unknown; defaultName: string; filters: FileFilter[] }) => {
    const bytes = asBytes(args.bytes)
    const win = winFrom(event)
    const opts: Electron.SaveDialogOptions = {
      title: 'Export',
      defaultPath: join(app.getPath('documents'), basename(String(args.defaultName || 'export'))),
      filters: Array.isArray(args.filters) ? args.filters : []
    }
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return null
    await storage.writeFileAtomic(res.filePath, bytes)
    return res.filePath
  })

  ipcMain.handle(IPC.saveExportMany, async (event, args: { files: { name: string; bytes: unknown }[] }) => {
    const win = winFrom(event)
    const opts: Electron.OpenDialogOptions = {
      title: 'Choose Export Folder',
      buttonLabel: 'Export Here',
      properties: ['openDirectory', 'createDirectory']
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return null
    const folder = res.filePaths[0]
    for (const f of args.files) {
      await storage.writeFileAtomic(join(folder, basename(String(f.name))), asBytes(f.bytes))
    }
    return folder
  })

  ipcMain.handle(IPC.printPages, async (event, args: { pages: PrintPage[]; title: string }) =>
    printPages(winFrom(event), args.pages.map((p) => ({ ...p, png: asBytes(p.png) })), String(args.title))
  )

  ipcMain.on(IPC.showItemInFolder, (_e, path: unknown) => {
    if (typeof path === 'string' && path) shell.showItemInFolder(path)
  })

  ipcMain.handle(IPC.listRecent, () => storage.listRecent())
  ipcMain.handle(IPC.clearRecent, async () => {
    await storage.clearRecent()
    await refreshMenu()
  })

  ipcMain.handle(IPC.readStore, (_e, name: string) => storage.readStore(name))
  ipcMain.handle(IPC.writeStore, (_e, name: string, value: unknown) => storage.writeStore(name, value))

  ipcMain.handle(IPC.writeRecovery, (_e, entry: RecoveryEntry, bytes: unknown) => storage.writeRecovery(entry, asBytes(bytes)))
  ipcMain.handle(IPC.listRecovery, () => storage.listRecovery())
  ipcMain.handle(IPC.readRecovery, (_e, id: string) => storage.readRecovery(id))
  ipcMain.handle(IPC.clearRecovery, (_e, id: string) => storage.clearRecovery(id))

  ipcMain.on(IPC.setTitle, (event, title: unknown) => {
    winFrom(event)?.setTitle(String(title).slice(0, 300))
  })
  ipcMain.handle(IPC.setFullScreen, (event, on: boolean) => {
    const win = winFrom(event)
    if (!win) return false
    win.setFullScreen(!!on)
    return win.isFullScreen()
  })
  ipcMain.on(IPC.setTheme, (event, theme: { dark: boolean; surface: string; symbol: string }) => {
    const win = winFrom(event)
    if (!win) return
    nativeTheme.themeSource = theme.dark ? 'dark' : 'light'
    if (process.platform !== 'darwin') {
      try {
        win.setTitleBarOverlay({ color: theme.surface, symbolColor: theme.symbol, height: 46 })
      } catch {
        // setTitleBarOverlay is unavailable on some platforms
      }
    }
  })
  ipcMain.on(IPC.updateMenu, (_e, state: MenuState) => {
    menuState = state
    refreshMenu().catch(() => undefined)
  })
  ipcMain.on(IPC.popupAppMenu, (event, x: number, y: number) => {
    const win = winFrom(event)
    const menu = Menu.getApplicationMenu()
    if (win && menu) menu.popup({ window: win, x: Math.round(x), y: Math.round(y) })
  })
  ipcMain.on(IPC.closeConfirmed, (event) => {
    const win = winFrom(event)
    if (!win) return
    allowClose = true
    win.close()
  })
}

// ---------------------------------------------------------------------------
// App lifecycle

app.on('second-instance', (_e, argv) => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
  const path = findDocArg(argv)
  if (path) mainWindow.webContents.send(IPC.openFile, path)
})

app.on('open-file', (event, path) => {
  event.preventDefault()
  if (mainWindow && !mainWindow.webContents.isLoading()) mainWindow.webContents.send(IPC.openFile, path)
  else pendingOpenPath = path
})

app.on('before-quit', () => {
  quitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || quitting) app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && app.isReady()) createWindow().catch(console.error)
})

app.whenReady().then(async () => {
  if (!isDev) serveRenderer(join(__dirname, '../renderer'))
  app.setAboutPanelOptions({
    applicationName: APP.appName,
    applicationVersion: APP.version,
    copyright: APP.copyright
  })
  registerIpc()
  await createWindow()
})
