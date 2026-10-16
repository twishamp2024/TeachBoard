import { expect, test } from '@playwright/test'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, rgb } from 'pdf-lib'
import {
  docState,
  drawPath,
  forceQuit,
  jpegSize,
  launch,
  messageBoxesShown,
  pageObjects,
  pngSize,
  run,
  stubMessageBox,
  stubOpenDialog,
  stubSaveDialog,
  tempDir,
  type Launched, MOD } from './helpers'

let t: Launched

test.afterEach(async () => {
  if (t) await forceQuit(t.app)
})

const pagesState = (page: Launched['page']) =>
  page.evaluate(() =>
    (window as any).__tb.useDoc.getState().doc.sections.map((s: any) => ({ name: s.name, pages: s.pages.map((p: any) => ({ id: p.id, bg: p.background.pattern, color: p.background.color, n: p.objects.length, w: p.width, h: p.height })) }))
  )

test('AC-06 pages and sections: create, select, duplicate, delete, reorder, backgrounds, thumbnails, persistence', async () => {
  t = await launch()
  const { page, app } = t
  // Page 1: ink + grid background.
  await page.keyboard.press('p')
  await drawPath(page, [
    [300, 300],
    [900, 400]
  ])
  await page.keyboard.press(MOD + '+Shift+B')
  await page.locator('.bg-template', { hasText: 'Grid' }).first().click()
  await page.locator('.drawer button[aria-label="Close panel"]').click()

  // Add page 2 and give it a different background.
  await page.locator('.page-nav button[aria-label^="New Page"]').click()
  expect((await docState(page)).pageIndex).toBe(1)
  await page.keyboard.press(MOD + '+Shift+B')
  await page.locator('.bg-template', { hasText: 'Chalkboard' }).first().click()
  await page.locator('.drawer button[aria-label="Close panel"]').click()
  await page.keyboard.press('p')
  await drawPath(page, [
    [200, 200],
    [400, 600]
  ])

  // Duplicate page 2 → page 3 identical content, independent object ids.
  await page.keyboard.press(MOD + '+Shift+D')
  let st = await pagesState(page)
  expect(st[0].pages.map((p: any) => p.n)).toEqual([1, 1, 1])
  expect(st[0].pages.map((p: any) => p.bg)).toEqual(['grid', 'none', 'none'])
  expect(st[0].pages[1].color).toBe('#21463A')
  const p2 = await pageObjects(page, 1)
  const p3 = await pageObjects(page, 2)
  expect(p3[0].id).not.toBe(p2[0].id)
  expect({ ...p3[0], id: '' }).toEqual({ ...p2[0], id: '' })

  // Page numbering and thumbnails in the panel.
  await expect(page.locator('.thumb__num')).toHaveText(['1', '2', '3'])
  const blank = await page.evaluate(() => {
    const c = document.querySelectorAll<HTMLCanvasElement>('.thumb__canvas')
    return Array.from(c).map((x) => {
      const d = x.getContext('2d')!.getImageData(0, 0, x.width, x.height).data
      let non = 0
      for (let i = 0; i < d.length; i += 4) if (d[i] < 240) non++
      return non
    })
  })
  expect(blank.every((n) => n > 50)).toBe(true)

  // Select a page by clicking its thumbnail.
  await page.locator('.thumb').nth(0).click()
  expect((await docState(page)).pageIndex).toBe(0)

  // Sections: add one (with a fresh page), rename it, move a page into it by drag.
  await page.locator('.pages__head button[aria-label="New section"]').click()
  st = await pagesState(page)
  expect(st.map((s: any) => s.name)).toEqual(['Section 1', 'Section 2'])
  await page.locator('.section-head__name', { hasText: 'Section 2' }).dblclick()
  await page.locator('.section-head__input').fill('Homework')
  await page.keyboard.press('Enter')
  await page.locator('.thumb').nth(0).dragTo(page.locator('.section-head', { hasText: 'Homework' }))
  st = await pagesState(page)
  expect(st[1].name).toBe('Homework')
  expect(st[0].pages).toHaveLength(2)
  expect(st[1].pages.map((p: any) => p.bg)).toEqual(['none', 'grid'])
  await expect(page.locator('.thumb__num')).toHaveText(['1', '2', '3', '4'])

  // Delete a page with content (confirmation), never the last page.
  await page.locator('.thumb').nth(1).click()
  await run(page, 'page.delete')
  await expect(page.locator('.dialog', { hasText: 'Delete this page?' })).toBeVisible()
  await page.locator('.dialog .btn--danger').click()
  expect((await docState(page)).pageCount).toBe(3)

  // Save and reopen the complete document.
  const file = join(tempDir(), 'pages.tboard')
  await stubSaveDialog(app, file)
  await page.keyboard.press(MOD + '+S')
  await expect.poll(async () => (await docState(page)).dirty).toBe(false)
  const savedState = await pagesState(page)
  await run(page, 'file.new')
  expect((await docState(page)).pageCount).toBe(1)
  await stubOpenDialog(app, [file])
  await page.keyboard.press(MOD + '+O')
  await expect.poll(async () => (await docState(page)).pageCount).toBe(3)
  expect(await pagesState(page)).toEqual(savedState)

  // A lesson can never lose its only page.
  await run(page, 'file.new')
  await run(page, 'page.delete')
  expect((await docState(page)).pageCount).toBe(1)
})

test('AC-07 save and reopen after restart; unsaved changes, cancelled dialogs and invalid files', async () => {
  const userData = tempDir('tb-userdata-')
  t = await launch({ userData })
  let { page, app } = t
  const dir = tempDir()
  const file = join(dir, 'Lesson 7.tboard')

  // Cancelled save dialog: nothing written, still dirty.
  await page.keyboard.press('p')
  await drawPath(page, [
    [300, 300],
    [700, 500]
  ])
  await stubSaveDialog(app, null)
  await page.keyboard.press(MOD + '+S')
  await page.waitForTimeout(300)
  expect((await docState(page)).dirty).toBe(true)
  expect(readdirSync(dir)).toEqual([])

  // Real save; the untitled lesson takes the file's name.
  await stubSaveDialog(app, file)
  await page.keyboard.press(MOD + '+S')
  await expect.poll(async () => (await docState(page)).dirty).toBe(false)
  expect((await docState(page)).title).toBe('Lesson 7')
  const saved = await pageObjects(page)

  // Close normally (no prompt because nothing is unsaved) and restart.
  await stubMessageBox(app, 'Cancel')
  await app.close()
  t = await launch({ userData })
  ;({ page, app } = t)
  // Recent files survive the restart.
  const recent = await page.evaluate(() => (window as any).teachboard.listRecent())
  expect(recent.map((r: { path: string }) => r.path)).toContain(file)
  await page.evaluate((p) => (window as any).__tb.runCommand('file.openRecent', p), file)
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1)
  expect(await pageObjects(page)).toEqual(saved)
  expect((await docState(page)).title).toBe('Lesson 7')

  // Content remains editable after reopening: select and move the stroke.
  await page.keyboard.press(MOD + '+A')
  await page.keyboard.press('ArrowRight')
  expect(((await pageObjects(page))[0].points as number[])[0]).toBeCloseTo((saved[0].points as number[])[0] + 1, 5)

  // Unsaved changes: "Cancel" keeps the window open, "Don't Save" discards.
  await stubMessageBox(app, 'Cancel')
  await page.keyboard.press(MOD + '+N')
  await page.waitForTimeout(300)
  expect((await messageBoxesShown(app))[0]).toContain('Lesson 7')
  expect((await docState(page)).title).toBe('Lesson 7')
  await stubMessageBox(app, "Don't Save")
  await page.keyboard.press(MOD + '+N')
  await expect.poll(async () => (await docState(page)).title).toBe('Untitled Lesson')
  // The file on disk was not modified by the discarded change.
  await stubOpenDialog(app, [file])
  await page.keyboard.press(MOD + '+O')
  await expect.poll(async () => (await docState(page)).title).toBe('Lesson 7')
  expect(await pageObjects(page)).toEqual(saved)

  // Closing the window with unsaved changes prompts; "Save" writes the file and closes.
  await page.keyboard.press(MOD + '+A')
  await page.keyboard.press('Delete')
  await stubMessageBox(app, 'Save')
  const closed = app.waitForEvent('close')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await closed
  t = await launch({ userData })
  ;({ page, app } = t)
  await stubOpenDialog(app, [file])
  await page.keyboard.press(MOD + '+O')
  await expect.poll(async () => (await docState(page)).title).toBe('Lesson 7')
  expect(await pageObjects(page)).toEqual([])

  // Invalid files are rejected with a message and the current lesson is kept.
  const bad = join(dir, 'broken.tboard')
  writeFileSync(bad, 'this is not a lesson')
  await stubOpenDialog(app, [bad])
  await page.keyboard.press(MOD + '+O')
  await expect(page.locator('.toast--error')).toContainText('not a lesson file')
  expect((await docState(page)).title).toBe('Lesson 7')
  // Cancelled open dialog: nothing changes.
  await stubOpenDialog(app, null)
  await page.keyboard.press(MOD + '+O')
  await page.waitForTimeout(300)
  expect((await docState(page)).title).toBe('Lesson 7')
})

test('AC-08 import and export: PDF, PNG, JPEG, native lesson, images and PDF import', async () => {
  t = await launch()
  const { page, app } = t
  const dir = tempDir()
  // Three pages with content and different sizes.
  await page.keyboard.press('p')
  await drawPath(page, [
    [200, 200],
    [800, 600]
  ])
  await page.keyboard.press(MOD + '+Shift+N')
  await page.keyboard.press('s')
  const { dragPage } = await import('./helpers')
  await dragPage(page, [400, 300], [900, 700])
  await page.keyboard.press(MOD + '+Shift+N')
  await run(page, 'page.setup')
  await page.locator('.dialog select').selectOption('a4-portrait')
  await page.locator('.dialog .btn--primary').click()
  const before = JSON.stringify(await page.evaluate(() => (window as any).__tb.useDoc.getState().doc.sections))

  // PDF (all pages): page count and per-page sizes preserved.
  await stubSaveDialog(app, join(dir, 'lesson.pdf'))
  await run(page, 'file.exportPdf')
  await page.locator('.dialog .segmented__item', { hasText: 'All 3 pages' }).click()
  await page.locator('.dialog .btn--primary').click()
  await expect.poll(() => existsSync(join(dir, 'lesson.pdf')), { timeout: 30000 }).toBe(true)
  const pdf = await PDFDocument.load(readFileSync(join(dir, 'lesson.pdf')))
  expect(pdf.getPageCount()).toBe(3)
  expect(pdf.getPage(0).getSize()).toEqual({ width: 1440, height: 810 })
  expect(pdf.getPage(2).getSize()).toEqual({ width: 930, height: 1315.5 })

  // PNG of one page, at 1× quality.
  await stubSaveDialog(app, join(dir, 'page.png'))
  await run(page, 'file.exportPng')
  await page.locator('.dialog .segmented__item', { hasText: 'Standard (1×)' }).click()
  await page.locator('.dialog .btn--primary').click()
  await expect.poll(() => existsSync(join(dir, 'page.png')), { timeout: 15000 }).toBe(true)
  expect(pngSize(readFileSync(join(dir, 'page.png')))).toEqual({ width: 1240, height: 1754 })

  // JPEG.
  await stubSaveDialog(app, join(dir, 'page.jpg'))
  await run(page, 'file.exportJpeg')
  await page.locator('.dialog .btn--primary').click()
  await expect.poll(() => existsSync(join(dir, 'page.jpg')), { timeout: 15000 }).toBe(true)
  expect(jpegSize(readFileSync(join(dir, 'page.jpg')))).toEqual({ width: 2480, height: 3508 })

  // All pages as PNG into a folder.
  const folder = tempDir()
  await stubOpenDialog(app, [folder])
  await run(page, 'file.exportAllPng')
  await expect.poll(() => readdirSync(folder).length, { timeout: 30000 }).toBe(3)
  expect(readdirSync(folder).every((f) => f.endsWith('.png'))).toBe(true)

  // Exporting never changes the editable lesson.
  expect(JSON.stringify(await page.evaluate(() => (window as any).__tb.useDoc.getState().doc.sections))).toBe(before)

  // Exported content matches the document: first page has dark ink where the stroke is.
  await page.locator('.thumb').nth(0).click()
  await stubSaveDialog(app, join(dir, 'p1.png'))
  await run(page, 'file.exportPng')
  await page.locator('.dialog .segmented__item', { hasText: 'Standard (1×)' }).click()
  await page.locator('.dialog .btn--primary').click()
  await expect.poll(() => existsSync(join(dir, 'p1.png')), { timeout: 15000 }).toBe(true)
  const ink = await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const onStroke = ctx.getImageData(500, 400, 1, 1).data
    const empty = ctx.getImageData(1600, 100, 1, 1).data
    return { onStroke: Array.from(onStroke), empty: Array.from(empty) }
  }, readFileSync(join(dir, 'p1.png')).toString('base64'))
  expect(ink.onStroke[0]).toBeLessThan(100)
  expect(ink.empty[0]).toBeGreaterThan(240)

  // Insert a local image.
  const imgPath = join(dir, 'p1.png')
  await stubOpenDialog(app, [imgPath])
  await run(page, 'insert.image')
  await expect.poll(async () => (await pageObjects(page)).some((o) => o.type === 'image')).toBe(true)

  // Import a PDF as pages.
  const src = await PDFDocument.create()
  for (let i = 0; i < 2; i++) {
    const p = src.addPage([595, 842])
    p.drawRectangle({ x: 50, y: 50, width: 200, height: 100, color: rgb(0.1, 0.5, 0.8) })
  }
  const pdfPath = join(dir, 'worksheet.pdf')
  writeFileSync(pdfPath, await src.save())
  await stubOpenDialog(app, [pdfPath])
  await run(page, 'file.importPdf')
  await expect.poll(async () => (await docState(page)).pageCount, { timeout: 30000 }).toBe(5)
  const st = await docState(page)
  expect(st.sections).toContain('worksheet')
  const imported = await page.evaluate(() => {
    const s = (window as any).__tb.useDoc.getState()
    const p = s.doc.sections.flatMap((x: any) => x.pages).find((x: any) => x.id === s.pageId)
    return { w: p.width, h: p.height, bg: p.background.imageAssetId }
  })
  expect(imported.bg).toBeTruthy()
  expect(imported.h / imported.w).toBeCloseTo(842 / 595, 2)

  // Native lesson export/import round trip (Save As, then reopen).
  await stubSaveDialog(app, join(dir, 'roundtrip.tboard'))
  await page.keyboard.press(MOD + '+Shift+S')
  await expect.poll(() => existsSync(join(dir, 'roundtrip.tboard'))).toBe(true)
  const all = JSON.stringify(await page.evaluate(() => (window as any).__tb.useDoc.getState().doc.sections))
  await run(page, 'file.new')
  await stubOpenDialog(app, [join(dir, 'roundtrip.tboard')])
  await page.keyboard.press(MOD + '+O')
  await expect.poll(async () => (await docState(page)).pageCount).toBe(5)
  expect(JSON.stringify(await page.evaluate(() => (window as any).__tb.useDoc.getState().doc.sections))).toBe(all)
})
