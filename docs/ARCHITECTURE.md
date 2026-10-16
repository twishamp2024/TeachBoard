# Architecture

## Technology choice

**Electron 44 + React 19 + TypeScript, built with electron-vite, packaged
with electron-builder.**

| Need | Why this stack fits |
|---|---|
| Pen & tablet input | Chromium's Pointer Events give pressure, coalesced high-frequency samples, pen-eraser buttons and touch on **both** Windows (Windows Ink) and macOS — identically, because the same engine ships with the app. |
| Drawing performance | Canvas 2D with cached `Path2D`s, viewport culling and a separate overlay layer for live strokes. |
| Same rendering everywhere | One bundled Chromium + bundled fonts → lessons look the same on Windows and macOS, in thumbnails, presentation and exports. |
| Files, menus, dialogs, printing, full screen | First-class Electron APIs (native menus, `dialog`, `webContents.print`, `setFullScreen`). |
| Installers | electron-builder produces a real NSIS `setup.exe` and a `setup.dmg` from one configuration. |
| Testing | Vitest for the engine; Playwright drives the *real* Electron app (and the installed app) for end-to-end tests. |

**Trade-offs considered.** Tauri would give a much smaller download, but it
renders with WebView2 on Windows and WKWebView on macOS. WKWebView's
Pointer Events pressure support and canvas behaviour differ from
Chromium's, which matters most for a pen-first whiteboard; we chose
behavioural consistency over size (~100 MB installed). A fully native stack
(Qt, .NET MAUI, Flutter) would have meant writing the document engine,
math typesetting and PDF tooling largely from scratch.

## Process model and security

```
┌──────────────────── main process (Node) ────────────────────┐
│ index.ts   window lifecycle, IPC handlers, single instance,  │
│            file associations, close/quit flow                │
│ storage.ts atomic writes, JSON stores, recent files, recovery│
│ menu.ts    native menu (labels/accelerators from renderer)   │
│ print.ts   hidden sandboxed print window                     │
│ protocol.ts app://bundle/ – serves the renderer with a CSP   │
└───────────────▲─────────────────────────────────────────────┘
                │  contextBridge: window.teachboard (shared/ipc.ts)
┌───────────────┴──── preload (sandboxed) ────────────────────┐
└───────────────▲─────────────────────────────────────────────┘
┌───────────────┴──── renderer (sandboxed, no Node) ──────────┐
│ React UI + document engine                                   │
└──────────────────────────────────────────────────────────────┘
```

* `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
* The renderer reaches the OS only through the typed API in
  [`src/shared/ipc.ts`](../src/shared/ipc.ts). The main process validates
  inputs (binary payloads, `.tboard` paths only for document reads, store
  names from an allow-list, safe recovery ids, file-size limits).
* The packaged renderer is served from a custom `app://` scheme with a
  strict Content-Security-Policy (no remote origins). Navigation and new
  windows are blocked.
* Printing uses a hidden window with JavaScript disabled.

## Renderer layout

```
src/renderer/src/
├── core/              pure, framework-free engine (unit tested in Node)
│   ├── model.ts           document types
│   ├── document.ts        page/section operations, ids
│   ├── geometry.ts        bounds, hit testing, shape outlines, transforms
│   ├── strokes.ts         pen outlines (perfect-freehand), smoothing
│   ├── eraser.ts          partial (split) and whole-object erasing
│   ├── history.ts         snapshot undo/redo
│   ├── render.ts          Canvas 2D renderer for pages/backgrounds/objects
│   ├── resources.ts       decoded images & typeset equations cache
│   ├── math.ts            LaTeX → SVG (MathJax, offline)
│   ├── text.ts            text layout and bundled fonts
│   ├── viewport.ts        page ↔ screen transforms, zoom steps
│   ├── serialization.ts   .tboard reader/writer, validation, migrations
│   ├── exporter.ts        PNG/JPEG/PDF export (pdf-lib)
│   ├── pdfImport.ts       PDF → page backgrounds (pdf.js)
│   ├── shortcuts.ts       key normalisation, keymaps, conflict rules
│   └── calculator.ts      safe expression evaluator (no eval)
├── state/             application state (zustand + immer)
│   ├── doc.ts             document, history, transactions, selection
│   ├── ui.ts              tools, panels, dialogs, viewports, widgets
│   ├── settings.ts        persisted preferences with validation
│   ├── library.ts         persisted resource library
│   ├── ops.ts             object/page/section/background operations
│   ├── files.ts           new/open/save, recovery, export, print, import
│   ├── clipboard.ts       copy/paste (in-app + system text/PNG)
│   ├── commands.ts        command dispatcher (menu, keys, toolbar)
│   └── view.ts            fit/zoom helpers
├── tools/             pointer tools (select, ink, eraser, shapes, text…)
└── ui/                React components
    ├── canvas/            CanvasView, inline editors, instruments
    ├── chrome/            top bar, tool dock, property bar, page nav
    ├── panels/            pages panel, drawer, background, resources
    ├── dialogs/           settings, equation editor, export, …
    ├── widgets/           timer, calculator, picker, magnifier, …
    └── present/           presentation mode
```

## Document state, undo and redo

The lesson is an immutable tree. Every edit goes through
`useDoc.commit(label, recipe)`, which applies an immer recipe (structural
sharing — unchanged pages and objects are reused) and pushes the previous
document onto the history stack. Undo/redo swap whole document snapshots,
so every kind of change — drawing, erasing, moving, formatting, page and
section operations, background changes — is undoable with the same
mechanism and cannot drift out of sync.

Continuous gestures (dragging, resizing, erasing, slider previews) use a
transaction: `begin()` → many `transient()` updates → `end(label)`, which
records **one** history entry. Each history entry remembers the page where
the change happened; undo and redo navigate there. The saved document is
also a snapshot reference, so "unsaved changes" is simply
`doc !== savedDoc` — undoing back to the saved state clears the indicator.

Viewport (zoom/pan), tool choice, panel layout and selection are UI state
and never touch the document.

## Rendering pipeline

* **Base canvas**: page shadow, background, then committed objects — only
  those intersecting the visible area. Redrawn when the page, viewport,
  size, device pixel ratio or a loaded resource changes.
* **Overlay canvas**: selection frame and handles, the live stroke being
  drawn, eraser cursor, shape previews, laser trail. Redrawn per frame
  while interacting, so drawing never re-renders the whole page.
* Pen strokes use perfect-freehand outlines (pressure-aware when the
  device reports pressure); markers, dashed pens and highlighters use
  smoothed centre-lines. Highlighters blend with *multiply* on light
  pages so ink underneath stays readable.
* Equations are typeset to self-contained SVG and drawn as images; the
  editable TeX source stays in the document.
* Thumbnails, presentation, PNG/JPEG/PDF export and printing all call the
  same `renderPage()`, at their own scale, so they always match the editor
  and are independent of the editor's zoom.

## Input

`CanvasView` converts Pointer Events to page coordinates, uses
`getCoalescedEvents()` for smooth fast strokes, captures the pointer, and
routes the gesture to the active tool. The middle button or a held Space
bar pans; a pen's eraser end erases; two-finger touch pans and pinch-zooms;
Ctrl/⌘ + wheel (and trackpad pinch) zooms around the cursor. `touch-action:
none` prevents browser scrolling and text selection while drawing.

## Persistence

| What | Where |
|---|---|
| Lessons | Wherever the user saves them (`.tboard`), written atomically |
| Settings, shortcuts, palette, toolbar | `<appData>/settings.json` |
| Resource library | `<appData>/resources.json` |
| Recent files | `<appData>/recent.json` (+ OS recent documents) |
| Window size/position | `<appData>/window-state.json` |
| Crash recovery | `<appData>/recovery/<lessonId>.tboard` |

`<appData>` is Electron's `userData`: `%APPDATA%\TeachBoard` on Windows,
`~/Library/Application Support/TeachBoard` on macOS. Recovery snapshots
are written ~8 s after editing pauses (and at most every 30 s), only when
there are unsaved changes, and are deleted when the lesson is saved or the
user discards changes. A recovered lesson opens as a new unsaved copy.

## Platform conventions

* Shortcuts use `Mod` = Ctrl (Windows) / ⌘ (macOS); redo is Ctrl+Y and
  Ctrl+Shift+Z on Windows, ⇧⌘Z on macOS; full screen is F11 / ⌃⌘F.
* macOS gets the app menu (About, Settings…, Hide, Quit), a Window menu,
  traffic lights inset into the top bar, and `open-file` handling.
* Windows gets the title-bar overlay buttons themed with the app, the menu
  behind the ☰ button, single-instance file opening and an AppUserModelID.
* The native menu shows the user's current shortcuts but does not register
  them; the renderer handles keys so text fields keep their own editing
  keys and custom bindings take effect immediately.
