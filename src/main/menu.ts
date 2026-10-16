import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { COMMAND_MAP } from '../shared/commands'
import { APP, IPC, type MenuState, type RecentFile } from '../shared/ipc'

/**
 * Builds the native application menu. Keyboard shortcuts are handled in the
 * renderer (so they respect text-editing focus and user customisation); the
 * menu only *displays* them, hence `registerAccelerator: false`.
 */
export function buildMenu(
  win: BrowserWindow | null,
  state: MenuState,
  recent: RecentFile[],
  isDev: boolean
): Menu {
  const isMac = process.platform === 'darwin'
  const send = (command: string, arg?: string) => win?.webContents.send(IPC.menuCommand, command, arg)

  const item = (id: string, extra: Partial<MenuItemConstructorOptions> = {}): MenuItemConstructorOptions => ({
    id,
    label: COMMAND_MAP[id]?.label ?? id,
    accelerator: state.accelerators[id],
    registerAccelerator: false,
    click: () => send(id),
    ...extra
  })
  const sep: MenuItemConstructorOptions = { type: 'separator' }

  const recentItems: MenuItemConstructorOptions[] = recent.length
    ? [
        ...recent.map((r) => ({ label: r.name, sublabel: r.path, click: () => send('file.openRecent', r.path) })),
        sep,
        { label: 'Clear Recent', click: () => send('file.clearRecent') }
      ]
    : [{ label: 'No Recent Lessons', enabled: false }]

  const template: MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({
      label: APP.appName,
      submenu: [
        item('help.about', { label: `About ${APP.appName}` }),
        sep,
        item('app.settings', { label: 'Settings…' }),
        sep,
        { role: 'services' },
        sep,
        { role: 'hide', label: `Hide ${APP.appName}` },
        { role: 'hideOthers' },
        { role: 'unhide' },
        sep,
        { role: 'quit', label: `Quit ${APP.appName}` }
      ]
    })
  }

  template.push({
    label: 'File',
    submenu: [
      item('file.new'),
      item('file.open'),
      { label: 'Open Recent', submenu: recentItems },
      sep,
      item('file.save'),
      item('file.saveAs'),
      sep,
      item('file.importPdf'),
      item('insert.image'),
      sep,
      {
        label: 'Export',
        submenu: [item('file.exportPdf'), item('file.exportPng'), item('file.exportJpeg'), item('file.exportAllPng')]
      },
      item('file.print'),
      sep,
      isMac ? { role: 'close', label: 'Close Window' } : { label: 'Exit', click: () => win?.close() }
    ]
  })

  template.push({
    label: 'Edit',
    submenu: [
      item('edit.undo', { enabled: state.canUndo }),
      item('edit.redo', { enabled: state.canRedo }),
      sep,
      item('edit.cut', { enabled: state.hasSelection }),
      item('edit.copy', { enabled: state.hasSelection }),
      item('edit.paste'),
      item('edit.duplicate', { enabled: state.hasSelection }),
      item('edit.delete', { enabled: state.hasSelection }),
      sep,
      item('edit.selectAll'),
      sep,
      {
        label: 'Arrange',
        submenu: [
          item('edit.bringToFront', { enabled: state.hasSelection }),
          item('edit.bringForward', { enabled: state.hasSelection }),
          item('edit.sendBackward', { enabled: state.hasSelection }),
          item('edit.sendToBack', { enabled: state.hasSelection })
        ]
      },
      item('edit.saveToLibrary', { enabled: state.hasSelection }),
      ...(isMac ? [] : [sep, item('app.settings')])
    ]
  })

  template.push({
    label: 'View',
    submenu: [
      item('view.zoomIn'),
      item('view.zoomOut'),
      item('view.zoomFit'),
      item('view.zoom100'),
      sep,
      item('view.togglePages'),
      item('view.resources'),
      sep,
      item('view.presentFromStart'),
      item('view.present'),
      item('view.toggleFullScreen'),
      ...(isDev ? [sep, { role: 'toggleDevTools' } as MenuItemConstructorOptions] : [])
    ]
  })

  template.push({
    label: 'Insert',
    submenu: [
      item('tool.text', { label: 'Text' }),
      item('insert.math'),
      item('insert.table'),
      item('insert.image'),
      sep,
      item('tool.shape', { label: 'Shape' }),
      item('tool.line', { label: 'Line or Arrow' }),
      item('tool.polygon', { label: 'Polygon' })
    ]
  })

  template.push({
    label: 'Page',
    submenu: [
      item('page.new'),
      item('page.duplicate'),
      item('page.delete'),
      sep,
      item('page.prev'),
      item('page.next'),
      item('page.first'),
      item('page.last'),
      sep,
      item('section.new'),
      sep,
      item('page.background'),
      item('page.setup'),
      item('page.clear')
    ]
  })

  template.push({
    label: 'Teaching',
    submenu: [
      item('teach.timer'),
      item('teach.calculator'),
      item('teach.picker'),
      sep,
      item('teach.ruler'),
      item('teach.protractor'),
      sep,
      item('teach.magnifier'),
      item('teach.spotlight'),
      item('teach.shade'),
      sep,
      item('view.resources')
    ]
  })

  template.push({
    label: 'Help',
    role: 'help',
    submenu: [item('help.shortcuts'), ...(isMac ? [] : [sep, item('help.about', { label: `About ${APP.appName}` })])]
  })

  if (isMac) {
    template.splice(template.length - 1, 0, { role: 'windowMenu' })
  }

  return Menu.buildFromTemplate(template)
}

