# TeachBoard

An offline whiteboard and digital-teaching application for **Windows** and
**macOS**. Draw with a mouse, pen tablet or touch screen; build multi-page
lessons with shapes, text, equations, images, tables and subject
backgrounds; present them full-screen; and save them as editable local
files — no account, no cloud.

> The application name and identity are configured in
> [`app.config.json`](app.config.json) and used everywhere (window titles,
> menus, About box, installers, bundle metadata, file type).

## Features

* **Ink** — pressure-sensitive pen (stylus), marker, dashed pen and a
  translucent highlighter; colour palette, custom colours and thickness
  presets; Shift draws straight lines; draw along the ruler.
* **Eraser** — partial (cuts ink) or whole-object; the pen's eraser end
  works too.
* **Shapes & lines** — rectangles, rounded rectangles, ellipses, triangles,
  right triangles, diamonds, parallelograms, trapezoids, pentagons,
  hexagons, stars, polygons; lines, arrows, double arrows, segments and
  rays; outline/fill/width and solid/dashed/dotted styles; Shift and Alt
  modifiers; any drag direction.
* **Text** — five bundled fonts, size, bold/italic/underline, alignment,
  colour; edit in place.
* **Maths** — a LaTeX equation editor with a symbol palette (fractions,
  powers, subscripts, roots, operators, Greek, functions, matrices),
  common formulas, multi-line aligned working and live preview, typeset
  offline with MathJax and kept editable.
* **Selection** — click, Shift-click, marquee; move, resize, nudge,
  duplicate, copy/paste (also to other apps as text and picture), delete,
  bring forward/send backward; edit tables cell by cell.
* **Pages & sections** — thumbnails, numbering, add/duplicate/delete,
  drag to reorder, named collapsible sections, per-page size and
  background.
* **Backgrounds** — colours, grid, graph paper, dots, ruled lines,
  handwriting lines, music staves, isometric, coordinate plane, chalkboard,
  blueprint, or your own image.
* **Teaching tools** — timer & stopwatch, calculator (places results on
  the page), random name picker, ruler (with straight-edge drawing),
  protractor, magnifier, spotlight, screen shade, laser pointer, and a
  resource library of physics, electrical, maths, chemistry and biology
  symbols plus your own saved resources.
* **Presentation** — full-screen from the start or current page, keyboard
  and click navigation, laser pointer and temporary ink that never alters
  the lesson.
* **Files** — native `.tboard` lessons (open/save/save as/recent, crash
  recovery, unsaved-change protection); export PDF/PNG/JPEG; print;
  import PDFs as pages; insert images.
* **Customisable** — light/dark theme, toolbar contents/order/position,
  palettes, drawing defaults, page defaults and keyboard shortcuts (with
  conflict detection), all saved locally.

## Download & install

See **[docs/INSTALL.md](docs/INSTALL.md)**. Installers:
`release/windows/setup.exe` and `release/macos/setup.dmg` (built on macOS —
see [docs/PACKAGING.md](docs/PACKAGING.md)).

## Development

Requirements: Node.js 22.12+ and npm.

```bash
npm install          # also downloads the Electron binary
npm run dev          # run with hot reload
npm run typecheck    # TypeScript
npm test             # unit tests (Vitest)
npm run test:e2e     # build, then end-to-end tests against the real app (Playwright)
npm run dist:win     # Windows installer → release/windows/setup.exe   (on Windows)
npm run dist:mac     # macOS disk image  → release/macos/setup.dmg     (on macOS)
npm run icons        # regenerate build/icon*.png from build/icon.svg
```

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Technology choice and trade-offs, process model and security, module map, undo model, rendering, input, persistence |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Layout, colour and type tokens, controls, icons, accessibility |
| [docs/FILE_FORMAT.md](docs/FILE_FORMAT.md) | The versioned `.tboard` lesson format |
| [docs/IMPORT_EXPORT.md](docs/IMPORT_EXPORT.md) | Supported formats and their limits |
| [docs/PACKAGING.md](docs/PACKAGING.md) | Building installers, signing, notarisation, CI |
| [docs/INSTALL.md](docs/INSTALL.md) | End-user installation on Windows and macOS |
| [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) | Acceptance checklist with test procedures and actual results |

## Project layout

```
app.config.json          application identity (name, id, version, file type)
src/main/                Electron main process (windows, menus, files, printing)
src/preload/             the narrow, typed bridge exposed to the UI
src/shared/              IPC contract and the command catalogue
src/renderer/src/core/   document engine (model, geometry, rendering, file format…)
src/renderer/src/state/  application state and operations
src/renderer/src/tools/  pointer tools
src/renderer/src/ui/     React interface
tests/unit/              engine tests (Vitest)
tests/e2e/               end-to-end tests driving the Electron app (Playwright)
build/                   icons and packaging resources
scripts/                 icon generation, config sync, release collection
```

## Licences

Application code: MIT. Bundled fonts (Atkinson Hyperlegible, Inter,
Merriweather, Patrick Hand, JetBrains Mono): SIL Open Font License.
Icons: Lucide (ISC). MathJax, pdf.js, pdf-lib, perfect-freehand, React,
zustand, immer, zod, fflate: their respective open-source licences (MIT /
Apache-2.0). Built-in teaching symbols and the app icon are original.
