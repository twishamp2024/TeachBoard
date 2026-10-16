import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { APP, IPC, type TeachBoardApi } from '../shared/ipc'

function subscribe<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]) => cb(...(args as T))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const platform = process.platform as TeachBoardApi['platform']

const api: TeachBoardApi = {
  platform,
  appName: APP.appName,
  appVersion: APP.version,
  isE2E: process.argv.includes('--tb-e2e'),

  openDocument: (path) => ipcRenderer.invoke(IPC.openDocument, path ?? null),
  saveDocument: (args) => ipcRenderer.invoke(IPC.saveDocument, args),
  confirmUnsaved: (name) => ipcRenderer.invoke(IPC.confirmUnsaved, name),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },

  pickFiles: (kind) => ipcRenderer.invoke(IPC.pickFiles, kind),
  saveExport: (args) => ipcRenderer.invoke(IPC.saveExport, args),
  saveExportMany: (args) => ipcRenderer.invoke(IPC.saveExportMany, args),
  printPages: (args) => ipcRenderer.invoke(IPC.printPages, args),
  showItemInFolder: (path) => ipcRenderer.send(IPC.showItemInFolder, path),

  listRecent: () => ipcRenderer.invoke(IPC.listRecent),
  clearRecent: () => ipcRenderer.invoke(IPC.clearRecent),

  readStore: (name) => ipcRenderer.invoke(IPC.readStore, name),
  writeStore: (name, value) => ipcRenderer.invoke(IPC.writeStore, name, value),

  writeRecovery: (entry, bytes) => ipcRenderer.invoke(IPC.writeRecovery, entry, bytes),
  listRecovery: () => ipcRenderer.invoke(IPC.listRecovery),
  readRecovery: (id) => ipcRenderer.invoke(IPC.readRecovery, id),
  clearRecovery: (id) => ipcRenderer.invoke(IPC.clearRecovery, id),

  setTitle: (title) => ipcRenderer.send(IPC.setTitle, title),
  setFullScreen: (on) => ipcRenderer.invoke(IPC.setFullScreen, on),
  setTheme: (theme) => ipcRenderer.send(IPC.setTheme, theme),
  updateMenu: (state) => ipcRenderer.send(IPC.updateMenu, state),
  popupAppMenu: (x, y) => ipcRenderer.send(IPC.popupAppMenu, x, y),
  closeConfirmed: () => ipcRenderer.send(IPC.closeConfirmed),

  onMenuCommand: (cb) => subscribe(IPC.menuCommand, cb),
  onOpenFile: (cb) => subscribe(IPC.openFile, cb),
  onRequestClose: (cb) => subscribe(IPC.requestClose, cb),
  onFullScreenChanged: (cb) => subscribe(IPC.fullScreenChanged, cb)
}

contextBridge.exposeInMainWorld('teachboard', api)
