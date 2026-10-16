/**
 * Command catalogue shared by the native menu (main process) and the
 * renderer's command/shortcut system. Bindings use a platform-neutral
 * syntax where `Mod` means Ctrl on Windows and Command on macOS.
 */

export type CommandCategory = 'File' | 'Edit' | 'View' | 'Tools' | 'Insert' | 'Page' | 'Teaching' | 'Help'

export interface CommandMeta {
  id: string
  label: string
  category: CommandCategory
  /** Default bindings. `mac` overrides `keys` on macOS when present. */
  keys?: string[]
  mac?: string[]
  /** Essential commands must always keep at least one binding. */
  essential?: boolean
}

export const COMMANDS: CommandMeta[] = [
  { id: 'file.new', label: 'New Lesson', category: 'File', keys: ['Mod+N'], essential: true },
  { id: 'file.open', label: 'Open…', category: 'File', keys: ['Mod+O'], essential: true },
  { id: 'file.save', label: 'Save', category: 'File', keys: ['Mod+S'], essential: true },
  { id: 'file.saveAs', label: 'Save As…', category: 'File', keys: ['Mod+Shift+S'] },
  { id: 'file.importPdf', label: 'Import PDF as Pages…', category: 'File' },
  { id: 'file.exportPdf', label: 'Export as PDF…', category: 'File', keys: ['Mod+Shift+E'] },
  { id: 'file.exportPng', label: 'Export Page as PNG…', category: 'File' },
  { id: 'file.exportJpeg', label: 'Export Page as JPEG…', category: 'File' },
  { id: 'file.exportAllPng', label: 'Export All Pages as PNG…', category: 'File' },
  { id: 'file.print', label: 'Print…', category: 'File', keys: ['Mod+P'] },

  { id: 'edit.undo', label: 'Undo', category: 'Edit', keys: ['Mod+Z'], essential: true },
  { id: 'edit.redo', label: 'Redo', category: 'Edit', keys: ['Mod+Y', 'Mod+Shift+Z'], mac: ['Mod+Shift+Z'], essential: true },
  { id: 'edit.cut', label: 'Cut', category: 'Edit', keys: ['Mod+X'] },
  { id: 'edit.copy', label: 'Copy', category: 'Edit', keys: ['Mod+C'] },
  { id: 'edit.paste', label: 'Paste', category: 'Edit', keys: ['Mod+V'] },
  { id: 'edit.duplicate', label: 'Duplicate', category: 'Edit', keys: ['Mod+D'] },
  { id: 'edit.delete', label: 'Delete', category: 'Edit', keys: ['Delete', 'Backspace'] },
  { id: 'edit.selectAll', label: 'Select All', category: 'Edit', keys: ['Mod+A'] },
  { id: 'edit.bringToFront', label: 'Bring to Front', category: 'Edit', keys: ['Mod+Shift+]'] },
  { id: 'edit.bringForward', label: 'Bring Forward', category: 'Edit', keys: ['Mod+]'] },
  { id: 'edit.sendBackward', label: 'Send Backward', category: 'Edit', keys: ['Mod+['] },
  { id: 'edit.sendToBack', label: 'Send to Back', category: 'Edit', keys: ['Mod+Shift+['] },
  { id: 'edit.saveToLibrary', label: 'Save Selection to Library…', category: 'Edit' },
  { id: 'app.settings', label: 'Settings…', category: 'Edit', keys: ['Mod+,'] },

  { id: 'view.zoomIn', label: 'Zoom In', category: 'View', keys: ['Mod+=', 'Mod+Shift+='] },
  { id: 'view.zoomOut', label: 'Zoom Out', category: 'View', keys: ['Mod+-'] },
  { id: 'view.zoomFit', label: 'Fit Page to Window', category: 'View', keys: ['Mod+0'] },
  { id: 'view.zoom100', label: 'Actual Size (100%)', category: 'View', keys: ['Mod+1'] },
  { id: 'view.togglePages', label: 'Show/Hide Pages Panel', category: 'View', keys: ['Mod+\\'] },
  { id: 'view.presentFromStart', label: 'Present from Beginning', category: 'View', keys: ['F5'] },
  { id: 'view.present', label: 'Present Current Page', category: 'View', keys: ['Shift+F5', 'Mod+Enter'] },
  { id: 'view.toggleFullScreen', label: 'Toggle Full Screen', category: 'View', keys: ['F11'], mac: ['Ctrl+Mod+F'] },

  { id: 'tool.select', label: 'Select Tool', category: 'Tools', keys: ['V'] },
  { id: 'tool.pan', label: 'Hand (Pan) Tool', category: 'Tools', keys: ['D'] },
  { id: 'tool.pen', label: 'Pen', category: 'Tools', keys: ['P'] },
  { id: 'tool.highlighter', label: 'Highlighter', category: 'Tools', keys: ['H'] },
  { id: 'tool.eraser', label: 'Eraser', category: 'Tools', keys: ['E'] },
  { id: 'tool.shape', label: 'Shapes', category: 'Tools', keys: ['S'] },
  { id: 'tool.line', label: 'Line / Arrow', category: 'Tools', keys: ['L'] },
  { id: 'tool.polygon', label: 'Polygon', category: 'Tools', keys: ['G'] },
  { id: 'tool.text', label: 'Text', category: 'Tools', keys: ['T'] },
  { id: 'tool.math', label: 'Math Equation', category: 'Tools', keys: ['M'] },
  { id: 'tool.laser', label: 'Laser Pointer', category: 'Tools', keys: ['K'] },

  { id: 'insert.image', label: 'Image…', category: 'Insert', keys: ['Mod+Shift+I'] },
  { id: 'insert.table', label: 'Table', category: 'Insert' },
  { id: 'insert.math', label: 'Math Equation…', category: 'Insert', keys: ['Mod+Shift+M'] },

  { id: 'page.new', label: 'New Page', category: 'Page', keys: ['Mod+Shift+N'] },
  { id: 'page.duplicate', label: 'Duplicate Page', category: 'Page', keys: ['Mod+Shift+D'] },
  { id: 'page.delete', label: 'Delete Page', category: 'Page' },
  { id: 'page.prev', label: 'Previous Page', category: 'Page', keys: ['PageUp'] },
  { id: 'page.next', label: 'Next Page', category: 'Page', keys: ['PageDown'] },
  { id: 'page.first', label: 'First Page', category: 'Page', keys: ['Home'] },
  { id: 'page.last', label: 'Last Page', category: 'Page', keys: ['End'] },
  { id: 'section.new', label: 'New Section', category: 'Page' },
  { id: 'page.background', label: 'Page Background…', category: 'Page', keys: ['Mod+Shift+B'] },
  { id: 'page.setup', label: 'Page Size…', category: 'Page' },
  { id: 'page.clear', label: 'Clear Page', category: 'Page' },

  { id: 'teach.timer', label: 'Timer & Stopwatch', category: 'Teaching' },
  { id: 'teach.calculator', label: 'Calculator', category: 'Teaching' },
  { id: 'teach.ruler', label: 'Ruler', category: 'Teaching' },
  { id: 'teach.protractor', label: 'Protractor', category: 'Teaching' },
  { id: 'teach.magnifier', label: 'Magnifier', category: 'Teaching' },
  { id: 'teach.spotlight', label: 'Spotlight', category: 'Teaching' },
  { id: 'teach.shade', label: 'Screen Shade', category: 'Teaching' },
  { id: 'teach.picker', label: 'Random Picker', category: 'Teaching' },
  { id: 'view.resources', label: 'Resource Library', category: 'Teaching', keys: ['Mod+Shift+R'] },

  { id: 'help.shortcuts', label: 'Keyboard Shortcuts', category: 'Help', keys: ['Mod+/', 'F1'] },
  { id: 'help.about', label: 'About', category: 'Help' }
]

export const COMMAND_MAP: Record<string, CommandMeta> = Object.fromEntries(COMMANDS.map((c) => [c.id, c]))

export function defaultKeysFor(meta: CommandMeta, isMac: boolean): string[] {
  return (isMac && meta.mac ? meta.mac : meta.keys) ?? []
}

/** Converts a binding like `Mod+Shift+Z` into an Electron accelerator string. */
export function toAccelerator(binding: string): string {
  const map: Record<string, string> = {
    Mod: 'CmdOrCtrl',
    Escape: 'Esc',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Enter: 'Return',
    ' ': 'Space'
  }
  return binding
    .split('+')
    .map((part, i, arr) => (part === '' && i === arr.length - 1 ? 'Plus' : map[part] ?? part))
    .join('+')
}
