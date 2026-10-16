import { useEffect } from 'react'
import { toAccelerator } from '../../../shared/commands'
import { ensureFontsLoaded } from '../core/resources'
import { bindingFromEvent, hasModifier, indexKeymap } from '../core/shortcuts'
import { api, APP_NAME, isMac } from '../platform'
import { isEditingText, runCommand } from '../state/commands'
import { currentPage, isDirty, useDoc } from '../state/doc'
import { freshDocument, maybeSaveChanges, openDocument, startRecoveryLoop, writeRecoveryNow } from '../state/files'
import { nudgeSelection } from '../state/ops'
import { flushSettings, useSettings } from '../state/settings'
import { useUi } from '../state/ui'
import { viewportFor } from '../state/view'
import { finishTextEdit } from '../tools/textTools'
import { CanvasView } from './canvas/CanvasView'
import { keyState } from './canvas/bus'
import { Dialogs } from './dialogs/Dialogs'
import { Drawer } from './panels/Drawer'
import { PagesPanel } from './panels/PagesPanel'
import { PageNav } from './chrome/PageNav'
import { Presentation } from './present/Presentation'
import { PropertyBar } from './chrome/PropertyBar'
import { Toasts, BusyOverlay } from './chrome/Toasts'
import { ToolDock } from './chrome/ToolDock'
import { TopBar } from './chrome/TopBar'
import { Widgets } from './widgets/Widgets'
import { cx } from './primitives'
import { currentKeymap } from './useKeymap'

/** Commands whose keyboard shortcut should stay with a focused text field. */
const TEXT_NATIVE = new Set(['edit.undo', 'edit.redo', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.selectAll', 'edit.delete'])

async function bootstrap(): Promise<void> {
  await useSettings.getState().load()
  useDoc.getState().reset(freshDocument(), null, true)
  void ensureFontsLoaded()
  startRecoveryLoop()
  const recovered = await api.listRecovery().catch(() => [])
  if (recovered.length) useUi.getState().openDialog({ kind: 'recovery' })
  if (api.isE2E) {
    // Test hook: exposes stores to end-to-end tests only (enabled by a launch flag).
    ;(window as unknown as Record<string, unknown>).__tb = { useDoc, useUi, useSettings, runCommand, viewport: () => viewportFor(currentPage(useDoc.getState())) }
  }
}

function useTheme(): void {
  const pref = useSettings((s) => s.settings.theme)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = pref === 'dark' || (pref === 'system' && mq.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      useUi.getState().set({ dark })
      const css = getComputedStyle(document.documentElement)
      api.setTheme({ dark, surface: css.getPropertyValue('--c-surface').trim(), symbol: css.getPropertyValue('--c-text').trim() })
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [pref])
}

function useGlobalKeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return
      const ui = useUi.getState()
      if (ui.presenting) return
      const editing = isEditingText()
      if (e.key === ' ' && !editing && !ui.dialog) {
        if (!keyState.space) {
          keyState.space = true
          window.dispatchEvent(new Event('tb-space'))
        }
        e.preventDefault()
        return
      }
      if (ui.dialog) return
      if (e.key === 'Escape' && !editing) {
        if (ui.cellEdit) ui.set({ cellEdit: null })
        else if (useDoc.getState().selection.length) useDoc.getState().setSelection([])
        else if (ui.drawer && !ui.drawerPinned) ui.setDrawer(null)
        else if (ui.widgets.length) ui.closeWidget(ui.widgets[ui.widgets.length - 1])
        return
      }
      if (!editing && e.key.startsWith('Arrow') && !e.ctrlKey && !e.metaKey && !e.altKey && useDoc.getState().selection.length) {
        const step = e.shiftKey ? 10 : 1
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
        if (d) {
          e.preventDefault()
          nudgeSelection(d[0], d[1])
          return
        }
      }
      const binding = bindingFromEvent(e, isMac)
      if (!binding) return
      const cmd = indexKeymap(currentKeymap()).get(binding)
      if (!cmd) return
      if (editing) {
        // Typing must never trigger single-key tool shortcuts, and text fields keep their own editing keys.
        if (!hasModifier(binding) && !/^F\d+$/.test(binding.split('+').pop() ?? '')) return
        if (TEXT_NATIVE.has(cmd)) return
      }
      e.preventDefault()
      if (e.repeat && !cmd.startsWith('view.zoom') && !cmd.startsWith('page.') && cmd !== 'edit.undo' && cmd !== 'edit.redo') return
      runCommand(cmd)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ' && keyState.space) {
        keyState.space = false
        window.dispatchEvent(new Event('tb-space'))
      }
    }
    const onBlur = () => {
      if (keyState.space) {
        keyState.space = false
        window.dispatchEvent(new Event('tb-space'))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
}

function useMainProcessBridge(): void {
  useEffect(() => {
    const offs = [
      api.onMenuCommand((cmd, arg) => runCommand(cmd, arg)),
      api.onOpenFile((path) => void openDocument(path)),
      api.onRequestClose(async () => {
        if (useUi.getState().textEdit) finishTextEdit()
        if (await maybeSaveChanges()) {
          await flushSettings().catch(() => undefined)
          api.closeConfirmed()
        }
      }),
      api.onFullScreenChanged((on) => {
        useUi.getState().set({ fullScreen: on })
      })
    ]
    return () => offs.forEach((off) => off())
  }, [])

  // Keep the native menu's shortcut labels and enabled states current.
  const shortcuts = useSettings((s) => s.settings.shortcuts)
  const canUndo = useDoc((s) => s.history.past.length > 0)
  const canRedo = useDoc((s) => s.history.future.length > 0)
  const hasSelection = useDoc((s) => s.selection.length > 0)
  useEffect(() => {
    const accelerators: Record<string, string | undefined> = {}
    for (const [cmd, keys] of Object.entries(currentKeymap())) accelerators[cmd] = keys[0] ? toAccelerator(keys[0]) : undefined
    api.updateMenu({ accelerators, canUndo, canRedo, hasSelection })
  }, [shortcuts, canUndo, canRedo, hasSelection])

  // Window title reflects the lesson name and unsaved state.
  const title = useDoc((s) => s.doc.title)
  const dirty = useDoc((s) => isDirty(s))
  useEffect(() => {
    const t = `${dirty ? '• ' : ''}${title} — ${APP_NAME}`
    document.title = t
    api.setTitle(t)
  }, [title, dirty])

  // Snapshot for crash recovery shortly after the user pauses.
  const revision = useDoc((s) => s.revision)
  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(() => void writeRecoveryNow(), 8000)
    return () => clearTimeout(t)
  }, [revision, dirty])
}

export function App() {
  const loaded = useSettings((s) => s.loaded)
  const presenting = useUi((s) => s.presenting)
  const pagesOpen = useUi((s) => s.pagesOpen)
  const dockLeft = useSettings((s) => s.settings.toolbar.position === 'left')

  useEffect(() => {
    void bootstrap()
  }, [])
  useTheme()
  useGlobalKeys()
  useMainProcessBridge()

  if (!loaded) return <div className="boot" aria-busy="true" />

  return (
    <div className={cx('app', isMac ? 'is-mac' : 'is-win', dockLeft && 'dock-left')}>
      <TopBar />
      <div className="workspace">
        {pagesOpen && <PagesPanel />}
        <main className="stage" aria-label="Whiteboard">
          <CanvasView />
          <PropertyBar />
          <ToolDock />
          <PageNav />
          <Widgets />
          <Drawer />
        </main>
      </div>
      <Dialogs />
      <Toasts />
      <BusyOverlay />
      {presenting && <Presentation />}
    </div>
  )
}
