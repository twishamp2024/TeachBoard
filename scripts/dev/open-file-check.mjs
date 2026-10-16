// Launches an executable the way the OS does for a double-clicked lesson file
// (no test hooks) and reports the window title and the opened document.
import { _electron as electron } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const exe = process.argv[2]
const lesson = process.argv[3]
const userData = mkdtempSync(join(tmpdir(), 'tb-open-'))
const app = await electron.launch({ executablePath: exe, args: [lesson], env: { ...process.env, TEACHBOARD_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.dock', { timeout: 30000 })
await page.waitForTimeout(2500)
const title = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle())
const hooks = await page.evaluate(() => typeof window.__tb)
const thumbs = await page.locator('.thumb').count()
await page.screenshot({ path: join(process.argv[4], 'installed-open.png') })
console.log(JSON.stringify({ title, testHooksExposed: hooks !== 'undefined', thumbnails: thumbs }))
await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
