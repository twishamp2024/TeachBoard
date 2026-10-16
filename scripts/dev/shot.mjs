// Dev helper: launches the built app, runs a steps file, and saves screenshots via snap(name).
import { _electron as electron } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const outDir = process.argv[2]
const stepsFile = process.argv[3]
const userData = mkdtempSync(join(tmpdir(), 'tb-shot-'))
const app = await electron.launch({ args: ['.'], env: { ...process.env, TEACHBOARD_USER_DATA: userData, TEACHBOARD_E2E: '1' } })
const page = await app.firstWindow()
const errors = []
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`) })
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1440, 900); w.center() })
await page.waitForSelector('.dock', { timeout: 20000 })
await page.waitForTimeout(600)
const snap = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: join(outDir, `${name}.png`) }) }
try {
  const steps = stepsFile ? readFileSync(stepsFile, 'utf8') : 'await snap("shot")'
  const fn = new Function('page', 'app', 'snap', `return (async () => { ${steps} })()`)
  await fn(page, app, snap)
} catch (e) {
  errors.push(`[script] ${e.stack}`)
  await page.screenshot({ path: join(outDir, 'failure.png') }).catch(() => undefined)
}
console.log(errors.join('\n') || 'no console errors')
await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
