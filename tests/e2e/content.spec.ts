import { expect, test } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { clickPage, dragPage, drawPath, docState, forceQuit, launch, pageObjects, pngSize, run, stubOpenDialog, stubSaveDialog, tempDir, type Launched, MOD, REDO } from './helpers'

let t: Launched

test.afterEach(async () => {
  if (t) await forceQuit(t.app)
})

test('AC-04 text and maths: add, edit, move, delete, equations, save/reopen and export', async () => {
  t = await launch()
  const { page, app } = t

  // Add text.
  await page.keyboard.press('t')
  await clickPage(page, 200, 200)
  await expect(page.locator('.text-editor')).toBeFocused()
  await page.keyboard.type('Fractions')
  // Tool shortcuts must not fire while typing (p, e, s are tool keys).
  expect(await page.evaluate(() => (window as any).__tb.useUi.getState().tool)).toBe('text')
  await page.keyboard.press('Escape')
  let objs = await pageObjects(page)
  expect(objs).toHaveLength(1)
  expect(objs[0]).toMatchObject({ type: 'text', text: 'Fractions', fontFamily: 'Atkinson Hyperlegible' })

  // Edit: double-click with the select tool, change content and formatting.
  await page.keyboard.press('v')
  const tx = objs[0] as unknown as { x: number; y: number; w: number; h: number }
  await clickPage(page, tx.x + 20, tx.y + tx.h / 2, { clickCount: 2 })
  await expect(page.locator('.text-editor')).toBeFocused()
  await page.keyboard.press('End')
  await page.keyboard.type(' and decimals')
  await page.locator('.pbar button[aria-label="Bold"]').click()
  await page.locator('.pbar select[aria-label="Font"]').selectOption('Patrick Hand')
  await clickPage(page, 1500, 900)
  objs = await pageObjects(page)
  expect(objs[0]).toMatchObject({ text: 'Fractions and decimals', bold: true, fontFamily: 'Patrick Hand' })

  // Move by dragging.
  const before = objs[0] as unknown as { x: number; y: number; h: number }
  await dragPage(page, [before.x + 30, before.y + before.h / 2], [before.x + 330, before.y + before.h / 2 + 100])
  objs = await pageObjects(page)
  expect(objs[0].x as number).toBeCloseTo(before.x + 300, -1)
  expect(objs[0].y as number).toBeCloseTo(before.y + 100, -1)

  // Equation with fraction, exponent, root and symbols via the palette and typing.
  await page.keyboard.press(MOD + '+Shift+M')
  const input = page.locator('.math-input')
  await input.click()
  await page.locator('.math-key[aria-label="Fraction"]').click()
  await page.keyboard.type('a')
  await input.press('End')
  await input.type(' + x')
  await page.locator('.math-key[aria-label="Superscript / exponent"]').click()
  await page.keyboard.type('2')
  await input.press('End')
  await input.type(' + ')
  await page.locator('.math-key[aria-label="nth root"]').click()
  await page.keyboard.type('3')
  await input.press('End')
  await page.locator('.chip', { hasText: 'Operators' }).click()
  await page.locator('.math-key[aria-label="Less or equal"]').click()
  await page.locator('.chip', { hasText: 'Greek' }).click()
  await page.locator('.math-key[aria-label="pi"]').click()
  const latex = await input.inputValue()
  expect(latex).toContain('\\frac{a}{}')
  expect(latex).toContain('^{2}')
  expect(latex).toContain('\\sqrt[3]{}')
  expect(latex).toContain('\\leq')
  expect(latex).toContain('\\pi')
  await expect(page.locator('.math-preview img')).toBeVisible()
  await page.locator('.dialog .btn--primary').click()
  objs = await pageObjects(page)
  const math = objs.find((o) => o.type === 'math')!
  expect(math.latex).toBe(latex)
  expect(math.w as number).toBeGreaterThan(100)

  // Invalid TeX is reported and cannot be inserted.
  await page.keyboard.press(MOD + '+Shift+M')
  await page.locator('.math-input').fill('\\frac{1')
  await expect(page.locator('.math-preview__error')).toBeVisible()
  await expect(page.locator('.dialog .btn--primary')).toBeDisabled()
  await page.keyboard.press('Escape')

  // Multi-line, aligned working.
  await page.keyboard.press(MOD + '+Shift+M')
  await page.locator('.math-input').fill('2x + 3 &= 11\n2x &= 8\nx &= 4')
  await page.locator('.dialog .btn--primary').click()

  // Rendering: every equation is typeset onto the canvas — dark glyph pixels
  // inside its own box (an unloaded equation shows only a pale placeholder).
  // Measured as a fraction of the box, so it holds at any zoom or pixel density.
  const inkPerEquation = () =>
    page.evaluate(() => {
      const tb = (window as any).__tb
      const s = tb.useDoc.getState()
      const pageObj = s.doc.sections.flatMap((x: any) => x.pages).find((p: any) => p.id === s.pageId)
      const v = tb.viewport()
      const c = document.querySelector('.canvas-layer') as HTMLCanvasElement
      const dpr = c.width / c.clientWidth
      const ctx = c.getContext('2d')!
      return pageObj.objects
        .filter((o: any) => o.type === 'math')
        .map((o: any) => {
          const x = Math.round((v.panX + o.x * v.zoom) * dpr)
          const y = Math.round((v.panY + o.y * v.zoom) * dpr)
          const w = Math.max(1, Math.round(o.w * v.zoom * dpr))
          const h = Math.max(1, Math.round(o.h * v.zoom * dpr))
          const d = ctx.getImageData(x, y, w, h).data
          let dark = 0
          for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 300 && d[i + 3] > 200) dark++
          return dark / (w * h)
        })
    })
  await expect.poll(async () => Math.min(...(await inkPerEquation())), { timeout: 10_000 }).toBeGreaterThan(0.02)

  // Save, reopen, export.
  const dir = tempDir()
  await stubSaveDialog(app, join(dir, 'maths.tboard'))
  await page.keyboard.press(MOD + '+S')
  await expect.poll(async () => (await docState(page)).dirty).toBe(false)
  const saved = await pageObjects(page)
  await run(page, 'file.new')
  await stubOpenDialog(app, [join(dir, 'maths.tboard')])
  await page.keyboard.press(MOD + '+O')
  await expect.poll(async () => (await pageObjects(page)).length).toBe(saved.length)
  expect(await pageObjects(page)).toEqual(saved)
  await stubSaveDialog(app, join(dir, 'maths.png'))
  await run(page, 'file.exportPng')
  await page.locator('.dialog .btn--primary').click()
  await expect.poll(() => existsSync(join(dir, 'maths.png')), { timeout: 15000 }).toBe(true)
  expect(pngSize(readFileSync(join(dir, 'maths.png')))).toEqual({ width: 3840, height: 2160 })

  // Edit the equation again (double-click) and delete the text.
  await page.keyboard.press('v')
  const m = (await pageObjects(page)).find((o) => o.type === 'math')! as unknown as { x: number; y: number; w: number; h: number }
  await clickPage(page, m.x + m.w / 2, m.y + m.h / 2, { clickCount: 2 })
  await expect(page.locator('.dialog', { hasText: 'Edit Equation' })).toBeVisible()
  await page.locator('.math-input').fill('E = mc^2')
  await page.locator('.dialog .btn--primary').click()
  // Equations were both placed at the centre; the topmost one is edited.
  const maths = (await pageObjects(page)).filter((o) => o.type === 'math')
  expect(maths).toHaveLength(2)
  expect(maths.at(-1)!.latex).toBe('E = mc^2')
  const txt = (await pageObjects(page)).find((o) => o.type === 'text')! as unknown as { x: number; y: number; h: number }
  await clickPage(page, txt.x + 20, txt.y + txt.h / 2)
  await page.keyboard.press('Delete')
  expect((await pageObjects(page)).find((o) => o.type === 'text')).toBeUndefined()
})

test('AC-05 undo and redo across drawing, erasing, shapes, moves, deletion, text and pages', async () => {
  t = await launch()
  const { page } = t
  const snapshots: string[] = []
  const snap = async () => snapshots.push(JSON.stringify(await page.evaluate(() => (window as any).__tb.useDoc.getState().doc.sections)))
  await snap()
  await page.keyboard.press('p')
  await drawPath(page, [
    [200, 200],
    [600, 260]
  ])
  await snap()
  await page.keyboard.press('s')
  await dragPage(page, [800, 200], [1000, 400])
  await snap()
  await page.keyboard.press('e')
  await dragPage(page, [400, 150], [400, 320])
  await snap()
  await page.keyboard.press('v')
  await clickPage(page, 800, 300)
  await dragPage(page, [800, 300], [900, 500])
  await snap()
  await page.keyboard.press('t')
  await clickPage(page, 200, 700)
  await page.keyboard.type('note')
  await page.keyboard.press('Escape')
  await snap()
  await page.keyboard.press('v')
  await clickPage(page, 210, 715, { clickCount: 2 })
  await page.keyboard.press('End')
  await page.keyboard.type(' edited')
  await page.keyboard.press('Escape')
  await snap()
  await clickPage(page, 900, 400)
  await page.keyboard.press('Delete')
  await snap()
  await page.keyboard.press(MOD + '+Shift+N')
  await page.keyboard.press('p')
  await drawPath(page, [
    [300, 300],
    [500, 500]
  ])
  await snap()
  const n = snapshots.length
  const current = async () => JSON.stringify(await page.evaluate(() => (window as any).__tb.useDoc.getState().doc.sections))

  // Walk all the way back, then forward, twice.
  for (let round = 0; round < 2; round++) {
    for (let i = n - 2; i >= 0; i--) {
      await page.keyboard.press(MOD + '+Z')
      // Adding a page plus drawing on it are two steps; the page step lands between snapshots.
      if (i === n - 2) {
        expect(await current()).not.toBe(snapshots[n - 1])
        await page.keyboard.press(MOD + '+Z')
      }
      expect(await current()).toBe(snapshots[i])
    }
    expect((await docState(page)).dirty).toBe(false)
    for (let i = 1; i < n; i++) {
      await page.keyboard.press(REDO)
      if (i === n - 1) await page.keyboard.press(MOD + '+Shift+Z')
      expect(await current()).toBe(snapshots[i])
    }
  }
  // The final redo returned to page 2 where the last change happened.
  expect((await docState(page)).pageIndex).toBe(1)
  // Undo while viewing page 1 jumps to the page that changed.
  await page.keyboard.press('PageUp')
  expect((await docState(page)).pageIndex).toBe(0)
  await page.keyboard.press(MOD + '+Z')
  expect((await docState(page)).pageIndex).toBe(1)
})
