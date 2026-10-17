import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Launches TeachBoard for end-to-end tests. By default it runs the built
 * sources (out/); set TB_EXECUTABLE to an installed/packaged executable to run
 * the same tests against the shipped application.
 */
export interface Launched {
  app: ElectronApplication
  page: Page
  userData: string
  errors: string[]
}

export function tempDir(prefix = 'tb-e2e-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

export async function launch(opts: { userData?: string; args?: string[] } = {}): Promise<Launched> {
  const userData = opts.userData ?? tempDir('tb-userdata-')
  const env = { ...process.env, TEACHBOARD_USER_DATA: userData, TEACHBOARD_E2E: '1' }
  const exe = process.env.TB_EXECUTABLE
  const app = exe
    ? await electron.launch({ executablePath: exe, args: opts.args ?? [], env })
    : await electron.launch({ args: [resolve(__dirname, '../..'), ...(opts.args ?? [])], env })
  const page = await app.firstWindow()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    if (w.isMaximized()) w.unmaximize()
    w.setSize(1400, 880)
    w.center()
  })
  await page.waitForSelector('.dock', { timeout: 30_000 })
  await page.waitForFunction(() => !!(window as unknown as { __tb?: unknown }).__tb)
  await page.waitForTimeout(300)
  return { app, page, userData, errors }
}

/** Quits without the unsaved-changes prompt (tests that check the prompt do so explicitly). */
export async function forceQuit(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ app: a }) => a.exit(0)).catch(() => undefined)
}

// ---------------------------------------------------------------------------
// Native dialog stubs (installed in the main process)

export async function stubSaveDialog(app: ElectronApplication, filePath: string | null): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    const g = globalThis as unknown as { __tbSaveDialogs?: number }
    g.__tbSaveDialogs = 0
    ;(dialog as unknown as Record<string, unknown>).showSaveDialog = async () => {
      g.__tbSaveDialogs = (g.__tbSaveDialogs ?? 0) + 1
      return p ? { canceled: false, filePath: p } : { canceled: true, filePath: undefined }
    }
  }, filePath)
}

/** How many times the stubbed save dialog has been shown since it was installed. */
export async function saveDialogsShown(app: ElectronApplication): Promise<number> {
  return app.evaluate(() => (globalThis as unknown as { __tbSaveDialogs?: number }).__tbSaveDialogs ?? 0)
}

export async function stubOpenDialog(app: ElectronApplication, filePaths: string[] | null): Promise<void> {
  await app.evaluate(({ dialog }, ps) => {
    ;(dialog as unknown as Record<string, unknown>).showOpenDialog = async () => (ps ? { canceled: false, filePaths: ps } : { canceled: true, filePaths: [] })
  }, filePaths)
}

/** Answers the next message boxes with the button labelled `label` (e.g. "Save", "Don't Save", "Cancel"). */
export async function stubMessageBox(app: ElectronApplication, label: string): Promise<void> {
  await app.evaluate(({ dialog }, l) => {
    const g = globalThis as unknown as { __tbMessageBoxes: string[] }
    g.__tbMessageBoxes = []
    ;(dialog as unknown as Record<string, unknown>).showMessageBox = async (...args: unknown[]) => {
      const opts = (args.length > 1 ? args[1] : args[0]) as { buttons: string[]; message: string }
      g.__tbMessageBoxes.push(opts.message)
      return { response: opts.buttons.indexOf(l), checkboxChecked: false }
    }
  }, label)
}

export async function messageBoxesShown(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(() => (globalThis as unknown as { __tbMessageBoxes?: string[] }).__tbMessageBoxes ?? [])
}

// ---------------------------------------------------------------------------
// Store access (exposed only with the e2e launch flag)

type Obj = Record<string, unknown> & { id: string; type: string }

export async function pageObjects(page: Page, pageIndex?: number): Promise<Obj[]> {
  return page.evaluate((i) => {
    const tb = (window as unknown as { __tb: { useDoc: { getState(): { doc: { sections: { pages: { id: string; objects: Obj[] }[] }[] }; pageId: string } } } }).__tb
    const s = tb.useDoc.getState()
    const pages = s.doc.sections.flatMap((x) => x.pages)
    const p = i === undefined ? pages.find((pg) => pg.id === s.pageId)! : pages[i]
    return JSON.parse(JSON.stringify(p.objects))
  }, pageIndex)
}

export async function docState(page: Page): Promise<{ pageCount: number; pageIndex: number; dirty: boolean; title: string; sections: string[]; selection: string[]; filePath: string | null; revision: number }> {
  return page.evaluate(() => {
    const tb = (window as unknown as { __tb: { useDoc: { getState(): Record<string, unknown> } } }).__tb
    const s = tb.useDoc.getState() as { doc: { title: string; sections: { name: string; pages: { id: string }[] }[] }; savedDoc: unknown; pageId: string; selection: string[]; filePath: string | null; revision: number }
    const pages = s.doc.sections.flatMap((x) => x.pages)
    return {
      pageCount: pages.length,
      pageIndex: pages.findIndex((p) => p.id === s.pageId),
      dirty: s.doc !== s.savedDoc,
      title: s.doc.title,
      sections: s.doc.sections.map((x) => x.name),
      selection: s.selection,
      filePath: s.filePath,
      revision: s.revision
    }
  })
}

export async function run(page: Page, command: string): Promise<void> {
  await page.evaluate((c) => (window as unknown as { __tb: { runCommand(c: string): void } }).__tb.runCommand(c), command)
}

export async function updateDrawing(page: Page, key: string, patch: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    ([k, p]) => (window as unknown as { __tb: { useSettings: { getState(): { updateDrawing(k: string, p: unknown): void } } } }).__tb.useSettings.getState().updateDrawing(k as string, p),
    [key, patch] as const
  )
}

export async function viewport(page: Page): Promise<{ zoom: number; panX: number; panY: number }> {
  return page.evaluate(() => (window as unknown as { __tb: { viewport(): { zoom: number; panX: number; panY: number } } }).__tb.viewport())
}

/** Converts page coordinates to absolute window coordinates for mouse input. */
export async function toScreen(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = (await page.locator('.canvas-host').boundingBox())!
  const v = await viewport(page)
  return { x: box.x + v.panX + x * v.zoom, y: box.y + v.panY + y * v.zoom }
}

export async function dragPage(page: Page, from: [number, number], to: [number, number], steps = 12): Promise<void> {
  const a = await toScreen(page, from[0], from[1])
  const b = await toScreen(page, to[0], to[1])
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps })
  await page.mouse.up()
}

export async function drawPath(page: Page, pts: [number, number][]): Promise<void> {
  const first = await toScreen(page, pts[0][0], pts[0][1])
  await page.mouse.move(first.x, first.y)
  await page.mouse.down()
  for (const p of pts.slice(1)) {
    const s = await toScreen(page, p[0], p[1])
    await page.mouse.move(s.x, s.y, { steps: 3 })
  }
  await page.mouse.up()
}

export async function clickPage(page: Page, x: number, y: number, opts: { clickCount?: number } = {}): Promise<void> {
  const s = await toScreen(page, x, y)
  await page.mouse.click(s.x, s.y, opts)
}

/** Reads an RGBA pixel from the base canvas at page coordinates. */
export async function pixelAt(page: Page, x: number, y: number): Promise<[number, number, number, number]> {
  const v = await viewport(page)
  return page.evaluate(
    ([px, py, vv]) => {
      const c = document.querySelector('.canvas-layer') as HTMLCanvasElement
      const dpr = c.width / c.clientWidth
      const sx = Math.round((vv.panX + px * vv.zoom) * dpr)
      const sy = Math.round((vv.panY + py * vv.zoom) * dpr)
      return Array.from(c.getContext('2d')!.getImageData(sx, sy, 1, 1).data) as [number, number, number, number]
    },
    [x, y, v] as const
  )
}

/** Reads the PNG width/height from its IHDR chunk. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10]
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) throw new Error('Not a PNG')
  const dv = new DataView(bytes.buffer, bytes.byteOffset)
  return { width: dv.getUint32(16), height: dv.getUint32(20) }
}

/** Reads JPEG dimensions from the SOF marker. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Not a JPEG')
  let i = 2
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) throw new Error('Bad JPEG')
    const marker = bytes[i + 1]
    const len = (bytes[i + 2] << 8) | bytes[i + 3]
    if (marker >= 0xc0 && marker <= 0xc3) return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] }
    i += 2 + len
  }
  throw new Error('No SOF')
}

/** The platform's primary modifier for keyboard shortcuts (Ctrl on Windows, ⌘ on macOS). */
export const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
export const isMacHost = process.platform === 'darwin'
/** Redo follows platform conventions: Ctrl+Y on Windows, ⇧⌘Z on macOS. */
export const REDO = isMacHost ? 'Meta+Shift+Z' : 'Control+Y'
