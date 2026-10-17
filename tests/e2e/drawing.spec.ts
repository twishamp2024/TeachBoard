import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import {
  clickPage,
  dragPage,
  drawPath,
  forceQuit,
  launch,
  pageObjects,
  pixelAt,
  run,
  stubOpenDialog,
  stubSaveDialog,
  tempDir,
  toScreen,
  updateDrawing,
  viewport,
  type Launched, MOD, REDO } from './helpers'

let t: Launched

test.afterEach(async () => {
  if (t) await forceQuit(t.app)
})

test('AC-01 pen and highlighter: colour, thickness, transparency, persistence', async () => {
  t = await launch()
  const { page, app } = t
  // Pen via toolbar, choose red and the thickest preset from the property bar.
  await page.locator('[data-tool="pen"]').click()
  await page.locator('.pbar .swatch[aria-label="#D93B3B"]').click()
  await page.locator('.width-picker__item[aria-label="20 pixels"]').click()
  await drawPath(page, [
    [200, 300],
    [400, 330],
    [600, 300],
    [800, 340]
  ])
  // Highlighter (keyboard), across the pen stroke.
  await page.keyboard.press('h')
  await page.locator('.pbar .swatch[aria-label="#7CF07C"]').click()
  await drawPath(page, [
    [250, 500],
    [900, 500]
  ])
  await drawPath(page, [
    [300, 320],
    [700, 320]
  ])
  const objs = await pageObjects(page)
  expect(objs).toHaveLength(3)
  expect(objs[0]).toMatchObject({ type: 'stroke', tool: 'pen', color: '#D93B3B', width: 20, opacity: 1 })
  expect((objs[0].points as number[]).length / 3).toBeGreaterThan(8)
  expect(objs[1]).toMatchObject({ type: 'stroke', tool: 'highlighter', color: '#7CF07C', opacity: 0.42 })

  // Highlighter is translucent: over white it is a light tint, not the solid colour.
  await page.waitForTimeout(300)
  const hl = await pixelAt(page, 600, 500)
  expect(hl[1]).toBeGreaterThan(200)
  expect(hl[0]).toBeGreaterThan(150) // a solid #7CF07C would have red = 124
  // Over the red pen stroke the ink stays visible (multiply darkens, never hides it).
  const over = await pixelAt(page, 500, 321)
  expect(over[0]).toBeGreaterThan(over[2])

  // Save, reopen in a new window session, and compare.
  const file = join(tempDir(), 'ink.tboard')
  await stubSaveDialog(app, file)
  await page.keyboard.press(MOD + '+S')
  await expect.poll(async () => (await page.evaluate(() => document.title)).startsWith('•')).toBe(false)
  await forceQuit(app)
  t = await launch()
  await stubOpenDialog(t.app, [file])
  await t.page.keyboard.press(MOD + '+O')
  await expect.poll(async () => (await pageObjects(t.page)).length).toBe(3)
  const reopened = await pageObjects(t.page)
  expect(reopened).toEqual(objs)
})

test('AC-02 eraser: partial and whole-object modes, undo, thumbnails and saved state', async () => {
  t = await launch()
  const { page, app } = t
  await page.keyboard.press('p')
  await drawPath(page, [
    [200, 300],
    [1000, 300]
  ])
  await drawPath(page, [
    [200, 600],
    [1000, 600]
  ])
  await page.keyboard.press('s')
  await dragPage(page, [1200, 200], [1500, 400])
  expect(await pageObjects(page)).toHaveLength(3)
  const thumbBefore = await page.locator('.thumb__canvas').first().evaluate((c: HTMLCanvasElement) => c.toDataURL())

  // Partial eraser cuts the first stroke in two.
  await page.keyboard.press('e')
  await expect(page.locator('.pbar [role="radio"][aria-checked="true"]', { hasText: 'Partial' })).toBeVisible()
  await dragPage(page, [600, 200], [600, 400], 10)
  let objs = await pageObjects(page)
  expect(objs.filter((o) => o.type === 'stroke')).toHaveLength(3)
  expect(objs.find((o) => o.type === 'shape')).toBeTruthy()

  // Whole-object mode removes the second stroke and the rectangle it touches.
  await page.locator('.pbar [role="radio"]', { hasText: 'Whole object' }).click()
  await dragPage(page, [400, 550], [400, 650], 6)
  await dragPage(page, [1200, 300], [1210, 300], 2)
  objs = await pageObjects(page)
  expect(objs.filter((o) => o.type === 'stroke')).toHaveLength(2)
  expect(objs.find((o) => o.type === 'shape')).toBeUndefined()

  // Thumbnail reflects the erased page.
  await expect.poll(() => page.locator('.thumb__canvas').first().evaluate((c: HTMLCanvasElement) => c.toDataURL())).not.toBe(thumbBefore)

  // Each erase gesture is one undo step.
  await page.keyboard.press(MOD + '+Z')
  expect(await pageObjects(page)).toHaveLength(3)
  await page.keyboard.press(MOD + '+Z')
  await page.keyboard.press(MOD + '+Z')
  expect(await pageObjects(page)).toHaveLength(3)
  expect((await pageObjects(page)).filter((o) => o.type === 'stroke')).toHaveLength(2)
  await page.keyboard.press(REDO)
  await page.keyboard.press(REDO)
  await page.keyboard.press(REDO)
  const finalObjs = await pageObjects(page)

  const file = join(tempDir(), 'erase.tboard')
  await stubSaveDialog(app, file)
  await page.keyboard.press(MOD + '+S')
  await expect.poll(async () => page.evaluate(() => document.title.startsWith('•'))).toBe(false)
  await run(page, 'file.new')
  await stubOpenDialog(app, [file])
  await page.keyboard.press(MOD + '+O')
  await expect.poll(async () => (await pageObjects(page)).length).toBe(finalObjs.length)
  expect(await pageObjects(page)).toEqual(finalObjs)
})

test('AC-03 shapes and lines: every preset, reverse drags, styles, editing, save and export', async () => {
  t = await launch()
  const { page, app } = t
  const kinds = ['rect', 'roundRect', 'ellipse', 'triangle', 'rightTriangle', 'diamond', 'parallelogram', 'trapezoid', 'pentagon', 'hexagon', 'star']
  await page.keyboard.press('s')
  for (let i = 0; i < kinds.length; i++) {
    await updateDrawing(page, 'shape', { kind: kinds[i], fill: i % 2 ? '#F2C522' : null, strokeWidth: 2 + (i % 3), dash: (['solid', 'dashed', 'dotted'] as const)[i % 3] })
    const col = i % 6
    const row = Math.floor(i / 6)
    const x = 120 + col * 290
    const y = 120 + row * 330
    // Alternate drag directions: right-down, left-up, right-up, left-down.
    const dir = i % 4
    const from: [number, number] = dir === 0 ? [x, y] : dir === 1 ? [x + 220, y + 200] : dir === 2 ? [x, y + 200] : [x + 220, y]
    const to: [number, number] = dir === 0 ? [x + 220, y + 200] : dir === 1 ? [x, y] : dir === 2 ? [x + 220, y] : [x, y + 200]
    await dragPage(page, from, to, 6)
  }
  const shapes = await pageObjects(page)
  expect(shapes.map((s) => s.kind)).toEqual(kinds)
  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i] as unknown as { x: number; y: number; w: number; h: number; strokeWidth: number; dash: string; fill: string | null }
    const col = i % 6
    const row = Math.floor(i / 6)
    expect(s.x).toBeCloseTo(120 + col * 290, 0)
    expect(s.y).toBeCloseTo(120 + row * 330, 0)
    expect(s.w).toBeCloseTo(220, 0)
    expect(s.h).toBeCloseTo(200, 0)
    expect(s.dash).toBe(['solid', 'dashed', 'dotted'][i % 3])
    expect(s.fill).toBe(i % 2 ? '#F2C522' : null)
  }

  // Lines and arrows, drawn right-to-left.
  await page.keyboard.press('l')
  await updateDrawing(page, 'line', { startCap: 'arrow', endCap: 'arrow', dash: 'dashed' })
  await dragPage(page, [1700, 900], [1300, 800])
  const line = (await pageObjects(page)).at(-1)!
  expect(line).toMatchObject({ type: 'line', startCap: 'arrow', endCap: 'arrow', dash: 'dashed' })
  expect(line.x1 as number).toBeCloseTo(1700, 0)
  expect(line.x2 as number).toBeCloseTo(1300, 0)

  // Edit: select the ellipse and change its fill and thickness from the property bar.
  await page.keyboard.press('v')
  await clickPage(page, 120 + 2 * 290 + 2, 120 + 100)
  expect((await page.evaluate(() => (window as any).__tb.useDoc.getState().selection)).length).toBe(1)
  await page.locator('.pbar .color-btn', { hasText: 'Fill' }).click()
  await page.locator('.color-pop .swatch[aria-label="#1E88E5"]').click()
  await page.locator('.pbar .width-picker__item[aria-label="8 pixels"]').click()
  const ellipse = (await pageObjects(page)).find((o) => o.kind === 'ellipse')!
  expect(ellipse).toMatchObject({ fill: '#1E88E5', strokeWidth: 8 })
  // Resize via the south-east handle.
  const before = ellipse as unknown as { x: number; y: number; w: number; h: number }
  await dragPage(page, [before.x + before.w, before.y + before.h], [before.x + before.w + 80, before.y + before.h + 40], 6)
  const resized = (await pageObjects(page)).find((o) => o.kind === 'ellipse') as unknown as { w: number; h: number }
  expect(resized.w).toBeCloseTo(before.w + 80, 0)
  expect(resized.h).toBeCloseTo(before.h + 40, 0)

  // Save and export to PDF.
  const dir = tempDir()
  await stubSaveDialog(app, join(dir, 'shapes.tboard'))
  await page.keyboard.press(MOD + '+S')
  await expect.poll(async () => page.evaluate(() => document.title.startsWith('•'))).toBe(false)
  await stubSaveDialog(app, join(dir, 'shapes.pdf'))
  await run(page, 'file.exportPdf')
  await page.locator('.dialog .btn--primary', { hasText: 'Export' }).click()
  await expect(page.locator('.toast', { hasText: 'Exported 1 page to PDF' })).toBeVisible({ timeout: 20000 })
  const { readFileSync } = await import('node:fs')
  expect(readFileSync(join(dir, 'shapes.pdf')).subarray(0, 5).toString()).toBe('%PDF-')
})

test('AC-10 zoom and pan: drawing stays aligned at every zoom, exports are zoom independent', async () => {
  t = await launch()
  const { page, app } = t
  await page.keyboard.press('p')
  for (const zoomKeys of [0, 2, -3]) {
    const key = zoomKeys >= 0 ? MOD + '+=' : MOD + '+-'
    for (let i = 0; i < Math.abs(zoomKeys); i++) await page.keyboard.press(key)
    const v = await viewport(page)
    // Draw at a known page position; the stored points must match the page coordinates.
    const target = { x: 960 + zoomKeys * 10, y: 540 }
    const s = await toScreen(page, target.x, target.y)
    await page.mouse.move(s.x, s.y)
    await page.mouse.down()
    await page.mouse.move(s.x + 40, s.y, { steps: 5 })
    await page.mouse.up()
    const o = (await pageObjects(page)).at(-1)!
    const pts = o.points as number[]
    // Within one screen pixel of the intended page position at this zoom.
    const tol = 1.5 / v.zoom
    expect(Math.abs(pts[0] - target.x)).toBeLessThan(tol)
    expect(Math.abs(pts[1] - target.y)).toBeLessThan(tol)
    expect(Math.abs(pts.at(-3)! - pts[0] - 40 / v.zoom)).toBeLessThan(tol * 2)
  }
  const z1 = (await viewport(page)).zoom
  // Pan with the hand tool, then with Space held.
  await page.keyboard.press('d')
  const box = (await page.locator('.canvas-host').boundingBox())!
  const v0 = await viewport(page)
  await page.mouse.move(box.x + 400, box.y + 300)
  await page.mouse.down()
  await page.mouse.move(box.x + 520, box.y + 360, { steps: 5 })
  await page.mouse.up()
  const v1 = await viewport(page)
  expect(v1.panX - v0.panX).toBeCloseTo(120, 0)
  expect(v1.panY - v0.panY).toBeCloseTo(60, 0)
  expect(v1.zoom).toBe(z1)
  // Ctrl+wheel zooms around the cursor.
  await page.mouse.move(box.x + 500, box.y + 400)
  await page.keyboard.down(MOD)
  await page.mouse.wheel(0, -300)
  await page.keyboard.up(MOD)
  expect((await viewport(page)).zoom).toBeGreaterThan(z1)

  // Resize the window: pointer alignment still holds.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 760))
  await page.waitForTimeout(400)
  await run(page, 'view.zoomFit')
  await page.keyboard.press('p')
  const s = await toScreen(page, 300, 300)
  await page.mouse.move(s.x, s.y)
  await page.mouse.down()
  await page.mouse.move(s.x + 30, s.y + 30, { steps: 4 })
  await page.mouse.up()
  const last = (await pageObjects(page)).at(-1)!.points as number[]
  const fz = (await viewport(page)).zoom
  expect(Math.abs(last[0] - 300)).toBeLessThan(1.5 / fz)
  expect(Math.abs(last[1] - 300)).toBeLessThan(1.5 / fz)

  // Export the same page at two different zoom levels: identical output size.
  const dir = tempDir()
  const { readFileSync } = await import('node:fs')
  const { pngSize } = await import('./helpers')
  await stubSaveDialog(app, join(dir, 'a.png'))
  await run(page, 'file.exportPng')
  await page.locator('.dialog .btn--primary').click()
  const { existsSync } = await import('node:fs')
  await expect.poll(() => existsSync(join(dir, 'a.png')), { timeout: 15000 }).toBe(true)
  await page.keyboard.press(MOD + '+=')
  await page.keyboard.press(MOD + '+=')
  await stubSaveDialog(app, join(dir, 'b.png'))
  await run(page, 'file.exportPng')
  await page.locator('.dialog .btn--primary').click()
  await expect.poll(() => existsSync(join(dir, 'b.png')), { timeout: 15000 }).toBe(true)
  const a = pngSize(readFileSync(join(dir, 'a.png')))
  const b = pngSize(readFileSync(join(dir, 'b.png')))
  expect(a).toEqual({ width: 3840, height: 2160 })
  expect(b).toEqual(a)
})

// The pen's barrel-eraser button cannot be synthesised through DevTools; it needs a physical stylus (documented).
test('AC-11 stylus: pen pointer events with pressure produce pressure-sensitive ink; mouse stays even', async () => {
  t = await launch()
  const { page } = t
  await page.keyboard.press('p')
  const cdp = await page.context().newCDPSession(page)
  const start = await toScreen(page, 300, 400)
  const send = (type: string, x: number, y: number, force: number, buttons = 1) =>
    cdp.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons, pointerType: 'pen', force, clickCount: 1 } as never)
  await send('mousePressed', start.x, start.y, 0.1)
  for (let i = 1; i <= 30; i++) await send('mouseMoved', start.x + i * 10, start.y + Math.sin(i / 4) * 20, i / 30)
  await send('mouseReleased', start.x + 300, start.y, 0)
  const pen = (await pageObjects(page)).at(-1)!
  expect(pen.pressure).toBe(true)
  const ps = (pen.points as number[]).filter((_, i) => i % 3 === 2)
  expect(Math.min(...ps)).toBeLessThan(0.3)
  expect(Math.max(...ps)).toBeGreaterThan(0.8)
  // Continuity: no gaps larger than the input steps (≤ ~19 screen px, incl. the release point),
  // measured in screen pixels so the check holds at any zoom / screen size.
  const zoom = (await viewport(page)).zoom
  const pts = pen.points as number[]
  for (let i = 3; i < pts.length; i += 3) expect(Math.hypot(pts[i] - pts[i - 3], pts[i + 1] - pts[i - 2]) * zoom).toBeLessThan(24)

  // A mouse stroke records no pressure.
  await drawPath(page, [
    [300, 800],
    [600, 820]
  ])
  const mouse = (await pageObjects(page)).at(-1)!
  expect(mouse.pressure).toBe(false)
})
