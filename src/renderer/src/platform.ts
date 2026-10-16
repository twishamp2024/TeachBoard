import { APP, type TeachBoardApi } from '../../shared/ipc'

declare global {
  interface Window {
    teachboard: TeachBoardApi
  }
}

/** The preload bridge. Undefined outside Electron (e.g. in unit tests). */
export const api: TeachBoardApi = (globalThis as unknown as { teachboard: TeachBoardApi }).teachboard

export const isMac = api?.platform === 'darwin'

/** Application identity comes from app.config.json (the single source of truth). */
export const APP_NAME = APP.appName
export const APP_VERSION = APP.version
export const DOC_EXTENSION = APP.fileExtension
