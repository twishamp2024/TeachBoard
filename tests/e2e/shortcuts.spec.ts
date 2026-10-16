import { expect, test } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { clickPage, docState, drawPath, forceQuit, launch, pageObjects, stubMessageBox, stubOpenDialog, stubSaveDialog, tempDir, type Launched, MOD, REDO } from './helpers'

let t: Launched

test.afterEach(async () => {
  if (t) await forceQuit(t.app)
})

const tool = (page: Launched['page']) => page.evaluate(() => (window as any).__tb.useUi.getState().tool)

test('AC-12 keyboard shortcuts: file, edit, tools, pages, text focus, conflicts and persistence', async () => {
  const userData = tempDir('tb-userdata-')
  t = await launch({ userData })
  let { page, app } = t

  // Tool shortcuts.
  for (const [key, id] of [
    ['v', 'select'],
    ['d', 'pan'],
    ['p', 'pen'],
    ['h', 'highlighter'],
    ['e', 'eraser'],
    ['s', 'shape'],
    ['l', 'line'],
    ['g', 'polygon'],
    ['t', 'text'],
    ['m', 'math'],
    ['k', 'laser']
  ]) {
    await page.keyboard.press(key)
    expect(await tool(page)).toBe(id)
  }

  // Undo / redo (Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z on Windows).
  await page.keyboard.press('p')
  await drawPath(page, [
    [200, 200],
    [500, 300]
  ])
  await page.keyboard.press(MOD + '+Z')
  expect(await pageObjects(page)).toHaveLength(0)
  await page.keyboard.press(REDO)
  expect(await pageObjects(page)).toHaveLength(1)
  await page.keyboard.press(MOD + '+Z')
  await page.keyboard.press(MOD + '+Shift+Z')
  expect(await pageObjects(page)).toHaveLength(1)

  // Copy, paste, duplicate, select all, delete.
  await page.keyboard.press(MOD + '+A')
  await page.keyboard.press(MOD + '+C')
  await page.keyboard.press(MOD + '+V')
  await expect.poll(async () => (await pageObjects(page)).length).toBe(2)
  await page.keyboard.press(MOD + '+D')
  expect(await pageObjects(page)).toHaveLength(3)
  await page.keyboard.press(MOD + '+A')
  await page.keyboard.press('Delete')
  expect(await pageObjects(page)).toHaveLength(0)

  // Page navigation.
  await page.keyboard.press(MOD + '+Shift+N')
  await page.keyboard.press(MOD + '+Shift+N')
  expect((await docState(page)).pageIndex).toBe(2)
  await page.keyboard.press('PageUp')
  expect((await docState(page)).pageIndex).toBe(1)
  await page.keyboard.press('Home')
  expect((await docState(page)).pageIndex).toBe(0)
  await page.keyboard.press('End')
  expect((await docState(page)).pageIndex).toBe(2)

  // Zoom.
  const label = page.locator('.zoom-control__value')
  const z0 = await label.textContent()
  await page.keyboard.press(MOD + '+=')
  expect(await label.textContent()).not.toBe(z0)
  await page.keyboard.press(MOD + '+0')
  expect(await label.textContent()).toBe(z0)
  await page.keyboard.press(MOD + '+1')
  await expect(label).toHaveText('100%')

  // While editing text, letters type and Ctrl+Z undoes typing, not the board.
  await page.keyboard.press(MOD + '+0')
  await page.keyboard.press('t')
  await clickPage(page, 300, 300)
  await page.keyboard.type('psv')
  expect(await tool(page)).toBe('text')
  await expect(page.locator('.text-editor')).toHaveValue('psv')
  await page.keyboard.press(MOD + '+A')
  await page.keyboard.type('hello')
  await page.keyboard.press(MOD + '+Z')
  await expect(page.locator('.text-editor')).not.toHaveValue('hello')
  const pagesBefore = (await docState(page)).pageCount
  expect(pagesBefore).toBe(3)
  await page.keyboard.press('Escape')

  // Save / Save As / Open / New with Ctrl.
  const dir = tempDir()
  await stubSaveDialog(app, join(dir, 'keys.tboard'))
  await page.keyboard.press(MOD + '+S')
  await expect.poll(async () => (await docState(page)).dirty).toBe(false)
  await page.keyboard.press(MOD + '+N')
  expect((await docState(page)).pageCount).toBe(1)
  await stubOpenDialog(app, [join(dir, 'keys.tboard')])
  await page.keyboard.press(MOD + '+O')
  await expect.poll(async () => (await docState(page)).pageCount).toBe(3)
  await stubSaveDialog(app, join(dir, 'keys-copy.tboard'))
  await page.keyboard.press(MOD + '+Shift+S')
  await expect.poll(() => existsSync(join(dir, 'keys-copy.tboard'))).toBe(true)

  // Shortcuts work while a dialog is open only for that dialog: Escape closes it, tool keys do nothing.
  await page.keyboard.press(MOD + '+,')
  await expect(page.locator('.dialog', { hasText: 'Settings' })).toBeVisible()
  await page.keyboard.press('p')
  expect(await tool(page)).not.toBe('pen')

  // Customise: give Pen the "B" key. A conflicting key is refused with a message.
  await page.getByRole('tab', { name: 'Shortcuts' }).click()
  const row = (label: string) => page.locator('.shortcut-edit-row').filter({ has: page.locator('.shortcut-edit-row__label', { hasText: new RegExp(`^${label}$`) }) })
  const penRow = row('Pen')
  await penRow.getByRole('button', { name: 'Change' }).click()
  await page.keyboard.press('e')
  await expect(penRow.locator('.shortcut-edit-row__msg')).toContainText('already used by “Eraser”')
  await penRow.getByRole('button', { name: 'Change' }).click()
  await page.keyboard.press('b')
  await expect(penRow.locator('kbd')).toHaveText('B')
  // An essential command cannot lose its only shortcut.
  await expect(row('Save').locator('button[aria-label^="Remove shortcut"]')).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.keyboard.press('v')
  await page.keyboard.press('b')
  expect(await tool(page)).toBe('pen')
  await page.keyboard.press('v')
  await page.keyboard.press('p')
  expect(await tool(page)).toBe('select')

  // The custom binding persists across restarts.
  await page.waitForTimeout(600)
  const settings = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'))
  expect(settings.shortcuts['tool.pen']).toEqual(['B'])
  await stubMessageBox(app, "Don't Save")
  await forceQuit(app)
  t = await launch({ userData })
  ;({ page, app } = t)
  await page.keyboard.press('b')
  expect(await tool(page)).toBe('pen')
})

test('settings, resource library and teaching tools persist and work', async () => {
  const userData = tempDir('tb-userdata-')
  t = await launch({ userData })
  let { page } = t
  // Theme and toolbar position are application-wide and persist.
  await page.keyboard.press(MOD + '+,')
  await page.locator('.segmented__item', { hasText: 'Dark' }).click()
  await page.getByRole('tab', { name: 'Toolbar' }).click()
  await page.locator('.segmented__item', { hasText: 'Left side' }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('.dock--left')).toBeVisible()

  // Save a selection to the library.
  await page.keyboard.press('s')
  const { dragPage } = await import('./helpers')
  await dragPage(page, [400, 300], [700, 500])
  await page.keyboard.press(MOD + '+A')
  await page.locator('.canvas-host').click({ button: 'right', position: { x: 10, y: 10 } })
  await page.locator('.menu__item', { hasText: 'Save Selection to Library' }).click()
  await page.locator('.dialog input').fill('My box')
  await page.locator('.dialog .btn--primary').click()
  await page.waitForTimeout(600)

  // Calculator evaluates and places its result on the page.
  await page.evaluate(() => (window as any).__tb.useUi.getState().toggleWidget('calculator'))
  await page.locator('.calc__expr').fill('2^10 + sqrt(81)')
  await page.keyboard.press('Enter')
  await expect(page.locator('.calc__result')).toHaveText('= 1033')
  await page.locator('.floating button', { hasText: 'Place result on page' }).click()
  expect((await pageObjects(page)).some((o) => o.type === 'text' && o.text === '2^10 + sqrt(81) = 1033')).toBe(true)

  // Restart: settings and library survive.
  await forceQuit(t.app)
  t = await launch({ userData })
  ;({ page } = t)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('.dock--left')).toBeVisible()
  await page.keyboard.press(MOD + '+Shift+R')
  await page.locator('.chip', { hasText: 'My Library' }).click()
  await expect(page.locator('.lib-tile', { hasText: 'My box' })).toBeVisible()
  await page.locator('.lib-tile', { hasText: 'My box' }).click()
  expect((await pageObjects(page)).filter((o) => o.type === 'shape')).toHaveLength(1)
  // Deleting a library item asks first.
  await page.locator('.lib-tile', { hasText: 'My box' }).click({ button: 'right' })
  await page.locator('.menu__item', { hasText: 'Delete' }).click()
  await expect(page.locator('.dialog', { hasText: 'Delete “My box”?' })).toBeVisible()
  await page.locator('.dialog .btn--danger').click()
  await expect(page.locator('.lib-tile', { hasText: 'My box' })).toHaveCount(0)
})
