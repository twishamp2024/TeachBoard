import { COMMANDS, COMMAND_MAP, defaultKeysFor } from '../../../shared/commands'

/**
 * Bindings are strings like "Mod+Shift+Z". Modifier order is canonical:
 * Ctrl (macOS only), Mod, Alt, Shift. `Mod` is Ctrl on Windows and ⌘ on macOS.
 */
export type Keymap = Record<string, string[]>

/** Overrides stored in settings: command id → bindings (empty array = unbound). */
export type KeymapOverrides = Record<string, string[]>

export interface KeyEventLike {
  key: string
  code: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

const CODE_KEYS: Record<string, string> = {
  Equal: '=',
  Minus: '-',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Slash: '/',
  Comma: ',',
  Period: '.',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  NumpadAdd: '=',
  NumpadSubtract: '-',
  NumpadEnter: 'Enter',
  Space: 'Space'
}

const NAMED_KEYS = new Set([
  'Enter',
  'Escape',
  'Tab',
  'Backspace',
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight'
])

function baseKey(e: KeyEventLike): string | null {
  if (['Control', 'Meta', 'Alt', 'Shift', 'OS', 'AltGraph', 'CapsLock'].includes(e.key)) return null
  if (/^F\d{1,2}$/.test(e.key)) return e.key
  if (NAMED_KEYS.has(e.key)) return e.key
  if (CODE_KEYS[e.code]) return CODE_KEYS[e.code]
  if (/^Digit\d$/.test(e.code)) return e.code.slice(5)
  if (/^Numpad\d$/.test(e.code)) return e.code.slice(6)
  // Letters follow the active keyboard layout.
  if (e.key.length === 1 && /[a-z]/i.test(e.key)) return e.key.toUpperCase()
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3)
  if (e.key.length === 1) return e.key
  return null
}

export function bindingFromEvent(e: KeyEventLike, isMac: boolean): string | null {
  const key = baseKey(e)
  if (!key) return null
  const parts: string[] = []
  if (isMac) {
    if (e.ctrlKey) parts.push('Ctrl')
    if (e.metaKey) parts.push('Mod')
  } else if (e.ctrlKey) {
    parts.push('Mod')
  }
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(key)
  return parts.join('+')
}

export function normalizeBinding(binding: string): string {
  const parts = binding.split('+').filter(Boolean)
  const key = parts.pop() ?? ''
  const order = ['Ctrl', 'Mod', 'Alt', 'Shift']
  const mods = order.filter((m) => parts.includes(m))
  return [...mods, key.length === 1 ? key.toUpperCase() : key].join('+')
}

/** Human-readable label for a binding on the current platform. */
export function formatBinding(binding: string, isMac: boolean): string {
  const macSymbols: Record<string, string> = { Ctrl: '⌃', Mod: '⌘', Alt: '⌥', Shift: '⇧' }
  const names: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Escape: 'Esc',
    Delete: isMac ? '⌦' : 'Del',
    Backspace: isMac ? '⌫' : 'Backspace',
    Enter: isMac ? '↩' : 'Enter',
    PageUp: 'PgUp',
    PageDown: 'PgDn'
  }
  const parts = binding.split('+')
  const key = parts.pop() ?? ''
  const label = names[key] ?? key
  // Apple's modifier order: ⌃ ⌥ ⇧ ⌘
  if (isMac) return ['Ctrl', 'Alt', 'Shift', 'Mod'].filter((m) => parts.includes(m)).map((p) => macSymbols[p]).join('') + label
  return [...parts.map((p) => (p === 'Mod' ? 'Ctrl' : p)), label].join('+')
}

/** Bindings that belong to the operating system and may not be assigned. */
export function isReservedBinding(binding: string, isMac: boolean): boolean {
  const reserved = isMac
    ? ['Mod+Q', 'Mod+H', 'Mod+Alt+H', 'Mod+M', 'Mod+W', 'Mod+Tab', 'Mod+Space', 'Ctrl+Mod+Q']
    : ['Alt+F4', 'Mod+Escape', 'Alt+Tab', 'Mod+Alt+Delete']
  return reserved.includes(normalizeBinding(binding)) || binding === 'Escape' || binding === 'Space'
}

export function buildKeymap(overrides: KeymapOverrides, isMac: boolean): Keymap {
  const map: Keymap = {}
  for (const c of COMMANDS) {
    const o = overrides[c.id]
    map[c.id] = (o ?? defaultKeysFor(c, isMac)).map(normalizeBinding)
  }
  return map
}

/** Reverse index binding → command id. When bindings conflict, the first command wins. */
export function indexKeymap(map: Keymap): Map<string, string> {
  const idx = new Map<string, string>()
  for (const [cmd, keys] of Object.entries(map)) {
    for (const k of keys) if (!idx.has(k)) idx.set(k, cmd)
  }
  return idx
}

export interface Conflict {
  binding: string
  commands: string[]
}

export function findConflicts(map: Keymap): Conflict[] {
  const seen = new Map<string, string[]>()
  for (const [cmd, keys] of Object.entries(map)) {
    for (const k of keys) {
      const list = seen.get(k) ?? []
      list.push(cmd)
      seen.set(k, list)
    }
  }
  return [...seen.entries()].filter(([, cmds]) => cmds.length > 1).map(([binding, commands]) => ({ binding, commands }))
}

export type AssignResult =
  | { ok: true; overrides: KeymapOverrides }
  | { ok: false; reason: 'reserved' | 'conflict' | 'essential'; conflictWith?: string }

/**
 * Assigns `binding` as the sole binding of `commandId`. Refuses OS-reserved
 * keys and conflicts (unless `replace` is set, in which case the binding is
 * removed from the other command — provided that command stays usable).
 */
export function assignBinding(
  overrides: KeymapOverrides,
  commandId: string,
  binding: string,
  isMac: boolean,
  replace = false
): AssignResult {
  const b = normalizeBinding(binding)
  if (isReservedBinding(b, isMac)) return { ok: false, reason: 'reserved' }
  const map = buildKeymap(overrides, isMac)
  const owner = Object.entries(map).find(([cmd, keys]) => cmd !== commandId && keys.includes(b))?.[0]
  const next: KeymapOverrides = { ...overrides, [commandId]: [b] }
  if (owner) {
    if (!replace) return { ok: false, reason: 'conflict', conflictWith: owner }
    const remaining = map[owner].filter((k) => k !== b)
    if (COMMAND_MAP[owner]?.essential && remaining.length === 0) return { ok: false, reason: 'essential', conflictWith: owner }
    next[owner] = remaining
  }
  return { ok: true, overrides: next }
}

/** Removes all bindings from a command, unless it is essential. */
export function clearBinding(overrides: KeymapOverrides, commandId: string): AssignResult {
  if (COMMAND_MAP[commandId]?.essential) return { ok: false, reason: 'essential' }
  return { ok: true, overrides: { ...overrides, [commandId]: [] } }
}

/** Single-key bindings (no modifier) must not fire while typing. */
export function hasModifier(binding: string): boolean {
  return /(^|\+)(Mod|Ctrl|Alt)\+/.test(binding)
}
