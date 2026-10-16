import { expect, test } from '@playwright/test'
import { docState, drawPath, forceQuit, launch, type Launched, MOD } from './helpers'

let t: Launched

test.afterEach(async () => {
  if (t) await forceQuit(t.app)
})

test('AC-09 presentation: full screen, navigation, faithful rendering, clean exit, lesson unchanged', async () => {
  t = await launch()
  const { page, app } = t
  // Three pages: ink on white, a shape on chalkboard, text on grid.
  await page.keyboard.press('p')
  await drawPath(page, [
    [300, 300],
    [1500, 700]
  ])
  await page.keyboard.press(MOD + '+Shift+N')
  await page.keyboard.press(MOD + '+Shift+B')
  await page.locator('.bg-template', { hasText: 'Chalkboard' }).first().click()
  await page.locator('.drawer button[aria-label="Close panel"]').click()
  await page.keyboard.press('t')
  const { clickPage } = await import('./helpers')
  await clickPage(page, 400, 400)
  await page.keyboard.type('Slide two')
  await page.keyboard.press('Escape')
  await page.keyboard.press(MOD + '+Shift+N')
  const before = await docState(page)
  const docBefore = JSON.stringify(await page.evaluate(() => (window as any).__tb.useDoc.getState().doc))

  // F5 presents from the beginning, full screen.
  await page.keyboard.press('F5')
  await expect(page.locator('.present')).toBeVisible()
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()), { timeout: 10000 }).toBe(true)
  await expect(page.locator('.present-bar__count')).toHaveText('1 / 3')

  // The presented page shows the content: sample the presentation canvas along the stroke.
  const sample = async (fx: number, fy: number) =>
    page.evaluate(
      ([x, y]) => {
        const c = document.querySelector('.present__layer') as HTMLCanvasElement
        return Array.from(c.getContext('2d')!.getImageData(Math.round(c.width * x), Math.round(c.height * y), 1, 1).data)
      },
      [fx, fy]
    )
  await page.waitForTimeout(400)
  const size = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
  const zoom = Math.min(size.w / 1920, size.h / 1080)
  const ox = (size.w - 1920 * zoom) / 2
  const oy = (size.h - 1080 * zoom) / 2
  const onStroke = await sample((ox + 900 * zoom) / size.w, (oy + 500 * zoom) / size.h)
  expect(onStroke[0]).toBeLessThan(100)

  // Navigate with keys and clicks.
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.present-bar__count')).toHaveText('2 / 3')
  await page.waitForTimeout(300)
  const bg = await sample((ox + 1800 * zoom) / size.w, (oy + 1000 * zoom) / size.h)
  expect(bg.slice(0, 3)).toEqual([0x21, 0x46, 0x3a]) // chalkboard background
  await page.mouse.click(size.w / 2, size.h / 3)
  await expect(page.locator('.present-bar__count')).toHaveText('3 / 3')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.present-bar__count')).toHaveText('3 / 3')
  await page.keyboard.press('Home')
  await expect(page.locator('.present-bar__count')).toHaveText('1 / 3')

  // Temporary ink and laser do not touch the lesson.
  await page.keyboard.press('d')
  await page.mouse.move(200, 200)
  await page.mouse.down()
  await page.mouse.move(500, 400, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.press('l')
  await page.mouse.move(600, 300, { steps: 5 })

  // Escape exits presentation and full screen.
  await page.keyboard.press('Escape')
  await expect(page.locator('.present')).toHaveCount(0)
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()), { timeout: 10000 }).toBe(false)
  const after = await docState(page)
  expect(after.revision).toBe(before.revision)
  expect(JSON.stringify(await page.evaluate(() => (window as any).__tb.useDoc.getState().doc))).toBe(docBefore)

  // Shift+F5 presents the current page; leaving OS full screen also ends it.
  await page.keyboard.press('PageUp')
  await page.keyboard.press('Shift+F5')
  await expect(page.locator('.present-bar__count')).toHaveText('2 / 3')
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()), { timeout: 10000 }).toBe(true)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(false))
  await expect(page.locator('.present')).toHaveCount(0, { timeout: 10000 })
})
