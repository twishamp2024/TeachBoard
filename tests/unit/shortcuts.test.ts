import { describe, expect, it } from 'vitest'
import { COMMANDS, toAccelerator } from '../../src/shared/commands'
import {
  assignBinding,
  bindingFromEvent,
  buildKeymap,
  clearBinding,
  findConflicts,
  formatBinding,
  hasModifier,
  indexKeymap,
  isReservedBinding,
  normalizeBinding
} from '../../src/renderer/src/core/shortcuts'

const ev = (key: string, code: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
  key,
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods
})

describe('key event normalisation', () => {
  it('maps Ctrl on Windows and ⌘ on macOS to Mod', () => {
    expect(bindingFromEvent(ev('s', 'KeyS', { ctrlKey: true }), false)).toBe('Mod+S')
    expect(bindingFromEvent(ev('s', 'KeyS', { metaKey: true }), true)).toBe('Mod+S')
    // Ctrl on macOS stays Ctrl (it is not ⌘).
    expect(bindingFromEvent(ev('s', 'KeyS', { ctrlKey: true }), true)).toBe('Ctrl+S')
  })

  it('uses physical keys for symbols so Shift does not change the binding name', () => {
    expect(bindingFromEvent(ev('+', 'Equal', { ctrlKey: true, shiftKey: true }), false)).toBe('Mod+Shift+=')
    expect(bindingFromEvent(ev('_', 'Minus', { ctrlKey: true, shiftKey: true }), false)).toBe('Mod+Shift+-')
    expect(bindingFromEvent(ev('Z', 'KeyZ', { ctrlKey: true, shiftKey: true }), false)).toBe('Mod+Shift+Z')
  })

  it('ignores bare modifier presses', () => {
    expect(bindingFromEvent(ev('Control', 'ControlLeft', { ctrlKey: true }), false)).toBeNull()
  })

  it('formats for each platform', () => {
    expect(formatBinding('Mod+Shift+Z', false)).toBe('Ctrl+Shift+Z')
    expect(formatBinding('Mod+Shift+Z', true)).toBe('⇧⌘Z')
    expect(formatBinding('Ctrl+Mod+F', true)).toBe('⌃⌘F')
    expect(formatBinding('Delete', true)).toBe('⌦')
  })

  it('converts to Electron accelerators', () => {
    expect(toAccelerator('Mod+Shift+Z')).toBe('CmdOrCtrl+Shift+Z')
    expect(toAccelerator('Mod+Enter')).toBe('CmdOrCtrl+Return')
    expect(toAccelerator('ArrowLeft')).toBe('Left')
  })
})

describe('keymaps', () => {
  it('has no conflicting default bindings on either platform', () => {
    expect(findConflicts(buildKeymap({}, false))).toEqual([])
    expect(findConflicts(buildKeymap({}, true))).toEqual([])
  })

  it('uses platform conventions for redo', () => {
    expect(buildKeymap({}, false)['edit.redo']).toEqual(['Mod+Y', 'Mod+Shift+Z'])
    expect(buildKeymap({}, true)['edit.redo']).toEqual(['Mod+Shift+Z'])
    expect(buildKeymap({}, true)['view.toggleFullScreen']).toEqual(['Ctrl+Mod+F'])
  })

  it('gives every essential command a default binding', () => {
    for (const c of COMMANDS.filter((x) => x.essential)) {
      expect(buildKeymap({}, false)[c.id].length).toBeGreaterThan(0)
    }
  })

  it('assigns custom bindings and rejects conflicts unless replacing', () => {
    const r1 = assignBinding({}, 'tool.pen', 'B', false)
    expect(r1.ok).toBe(true)
    const map = buildKeymap(r1.ok ? r1.overrides : {}, false)
    expect(map['tool.pen']).toEqual(['B'])
    expect(indexKeymap(map).get('B')).toBe('tool.pen')
    expect(indexKeymap(map).get('P')).toBeUndefined()

    const r2 = assignBinding({}, 'tool.pen', 'E', false)
    expect(r2).toEqual({ ok: false, reason: 'conflict', conflictWith: 'tool.eraser' })

    const r3 = assignBinding({}, 'tool.pen', 'E', false, true)
    expect(r3.ok).toBe(true)
    if (r3.ok) expect(buildKeymap(r3.overrides, false)['tool.eraser']).toEqual([])
  })

  it('refuses OS-reserved shortcuts', () => {
    expect(isReservedBinding('Mod+Q', true)).toBe(true)
    expect(isReservedBinding('Alt+F4', false)).toBe(true)
    expect(assignBinding({}, 'tool.pen', 'Alt+F4', false)).toMatchObject({ ok: false, reason: 'reserved' })
  })

  it('never leaves an essential command without a shortcut', () => {
    expect(clearBinding({}, 'file.save')).toMatchObject({ ok: false, reason: 'essential' })
    // Taking Mod+S away from Save would leave it unbound.
    expect(assignBinding({}, 'tool.pen', 'Mod+S', false, true)).toMatchObject({ ok: false, reason: 'essential' })
    expect(clearBinding({}, 'tool.laser').ok).toBe(true)
  })

  it('normalises modifier order', () => {
    expect(normalizeBinding('Shift+Mod+z')).toBe('Mod+Shift+Z')
    expect(hasModifier('Mod+S')).toBe(true)
    expect(hasModifier('P')).toBe(false)
    expect(hasModifier('Shift+F5')).toBe(false)
  })
})
