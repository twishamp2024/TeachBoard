import { useMemo } from 'react'
import { buildKeymap, type Keymap } from '../core/shortcuts'
import { isMac } from '../platform'
import { useSettings } from '../state/settings'

/** The effective keymap (defaults + user overrides) for this platform. */
export function useKeymap(): Keymap {
  const overrides = useSettings((s) => s.settings.shortcuts)
  return useMemo(() => buildKeymap(overrides, isMac), [overrides])
}

export function currentKeymap(): Keymap {
  return buildKeymap(useSettings.getState().settings.shortcuts, isMac)
}
