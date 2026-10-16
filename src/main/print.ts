import { app, BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { PrintPage } from '../shared/ipc'

/**
 * Prints pre-rendered page images through the operating system's print
 * dialog. A hidden, sandboxed window with JavaScript disabled lays out one
 * image per printed sheet.
 */
export async function printPages(parent: BrowserWindow | null, pages: PrintPage[], title: string): Promise<boolean> {
  if (!pages.length) return false
  const dir = join(app.getPath('temp'), `teachboard-print-${randomBytes(6).toString('hex')}`)
  await fs.mkdir(dir, { recursive: true })
  try {
    const imgs: string[] = []
    for (let i = 0; i < pages.length; i++) {
      const name = `page-${i + 1}.png`
      await fs.writeFile(join(dir, name), pages[i].png)
      imgs.push(`<section><img src="${name}" alt=""></section>`)
    }
    const landscape = pages[0].width >= pages[0].height
    const safeTitle = title.replace(/[<>&"]/g, '')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title><style>
      @page { margin: 8mm; }
      html, body { margin: 0; padding: 0; background: #fff; }
      section { width: 100%; height: 100vh; display: flex; align-items: center; justify-content: center; page-break-after: always; break-after: page; }
      section:last-child { page-break-after: auto; break-after: auto; }
      img { max-width: 100%; max-height: 100%; object-fit: contain; }
    </style></head><body>${imgs.join('')}</body></html>`
    const htmlPath = join(dir, 'print.html')
    await fs.writeFile(htmlPath, html, 'utf8')

    const win = new BrowserWindow({
      show: false,
      parent: parent ?? undefined,
      webPreferences: { sandbox: true, javascript: false, contextIsolation: true, nodeIntegration: false }
    })
    try {
      await win.loadFile(htmlPath)
      return await new Promise<boolean>((resolve) => {
        win.webContents.print({ silent: false, printBackground: true, landscape }, (success) => resolve(success))
      })
    } finally {
      win.destroy()
    }
  } finally {
    fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}
