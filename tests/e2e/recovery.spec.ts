import { expect, test } from '@playwright/test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { docState, drawPath, forceQuit, launch, MOD, pageObjects, run, tempDir, type Launched } from './helpers'

let t: Launched

test.afterEach(async () => {
  if (t) await forceQuit(t.app)
})

test('crash recovery: unsaved work is snapshotted and offered back after an abrupt exit', async () => {
  const userData = tempDir('tb-userdata-')
  t = await launch({ userData })
  await t.page.keyboard.press('p')
  await drawPath(t.page, [
    [300, 300],
    [900, 600]
  ])
  const drawn = await pageObjects(t.page)
  // The snapshot is written shortly after editing pauses.
  const recoveryDir = join(userData, 'recovery')
  await expect.poll(() => existsSync(recoveryDir) && readdirSync(recoveryDir).some((f) => f.endsWith('.tboard')), { timeout: 20000 }).toBe(true)

  // Simulate a crash: exit without the normal close flow.
  await forceQuit(t.app)
  t = await launch({ userData })
  await expect(t.page.locator('.dialog', { hasText: 'Recover Unsaved Work' })).toBeVisible()
  await t.page.locator('.recovery-list .btn--primary').first().click()
  await expect.poll(async () => (await pageObjects(t.page)).length).toBe(1)
  expect((await pageObjects(t.page))[0].points).toEqual(drawn[0].points)
  const st = await docState(t.page)
  expect(st.title).toContain('(Recovered)')
  // Opened as an unsaved copy: it is dirty and has no file path to overwrite.
  expect(st.dirty).toBe(true)
  expect(st.filePath).toBeNull()
  // The snapshot is removed once recovered.
  expect(readdirSync(recoveryDir).filter((f) => f.endsWith('.tboard'))).toHaveLength(0)
})

test('printing renders every page into the print job', async () => {
  t = await launch()
  const { page, app } = t
  await page.keyboard.press('p')
  await drawPath(page, [
    [300, 300],
    [900, 600]
  ])
  await page.keyboard.press(MOD + '+Shift+N')
  // Stub only the OS print dialog; everything up to it runs for real.
  await app.evaluate(({ webContents, nativeImage }) => {
    const proto = Object.getPrototypeOf(webContents.getAllWebContents()[0])
    const g = globalThis as unknown as { __printed: unknown[] }
    g.__printed = []
    proto.print = function (this: Electron.WebContents, opts: unknown, cb: (ok: boolean) => void) {
      // The print window has JavaScript disabled; inspect the page images it was given.
      const fsMod = process.getBuiltinModule('node:fs') as typeof import('node:fs')
      const pathMod = process.getBuiltinModule('node:path') as typeof import('node:path')
      const url = new URL(this.getURL())
      const dir = pathMod.dirname(decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/, '$1'))
      const html = fsMod.readFileSync(pathMod.join(dir, 'print.html'), 'utf8')
      const imgs = (html.match(/src="(page-\d+\.png)"/g) ?? []).map((m) => {
        const size = nativeImage.createFromPath(pathMod.join(dir, m.slice(5, -1))).getSize()
        return [size.width, size.height]
      })
      g.__printed.push({ opts, imgs })
      cb(true)
    }
  })
  await run(page, 'file.print')
  await expect.poll(() => app.evaluate(() => (globalThis as unknown as { __printed: unknown[] }).__printed.length), { timeout: 20000 }).toBe(1)
  const job = (await app.evaluate(() => (globalThis as unknown as { __printed: { opts: { landscape: boolean }; imgs: number[][] }[] }).__printed[0]))!
  expect(job.opts.landscape).toBe(true)
  expect(job.imgs).toHaveLength(2)
  expect(job.imgs[0]).toEqual([3840, 2160])
})
