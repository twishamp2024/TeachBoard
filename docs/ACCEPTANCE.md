# Acceptance checklist

Status values: **Not started** · **In progress** · **Implemented, not yet verified** · **Verified** · **Blocked by a documented limitation**.

"Verified" means the listed automated test was run and passed — against the
built application *and* against the application installed from
`release/windows/setup.exe` — on Windows 11 (x64). Results recorded on
2026-10-17. macOS results are pending a macOS build (see the end of this
document).

## Test runs

| Suite | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | Pass |
| Unit tests (engine) | `npm test` | **72 / 72 passed** (7 files) |
| End-to-end, built app | `npm run test:e2e` | **15 / 15 passed** |
| End-to-end, **installed** app | install `setup.exe /S`, then `TB_EXECUTABLE=…\TeachBoard.exe npx playwright test` | **15 / 15 passed** (JSON report: `release/logs/e2e-installed-windows.json`) |
| Installer | silent install → inspect → open a `.tboard` via the exe → silent uninstall → inspect | Pass (details under *Windows release*) |

The end-to-end tests drive the real Electron application with mouse,
keyboard and synthesised stylus input. Only the operating system's own
dialogs are stubbed (file pickers return a test path; the unsaved-changes
message box returns a chosen button; the print dialog is intercepted after
the print job is prepared). Everything inside the app — rendering, saving,
reading files from disk, exporting, printing preparation — runs for real.

## Mandatory functional requirements

| ID | Requirement | Status | Source modules | Test procedure | Actual result | Outstanding limitations |
|---|---|---|---|---|---|---|
| AC-01 | Pen and highlighter | **Verified** | `tools/inkTools.ts`, `core/strokes.ts`, `core/render.ts`, `ui/chrome/PropertyBar.tsx` | `drawing.spec.ts › AC-01`: choose red + 20 px from the property bar, draw a pen stroke; switch to highlighter (H) and choose green; draw across the ink; check stored colour/width/opacity; sample canvas pixels (highlight is a light translucent tint; ink beneath stays visible); save, restart, reopen and compare objects exactly | Pass | Physical tablet not tested (see AC-11) |
| AC-02 | Eraser | **Verified** | `core/eraser.ts`, `tools/inkTools.ts` (EraserTool) | `drawing.spec.ts › AC-02`: partial mode splits a stroke in two; whole-object mode removes a stroke and a rectangle; thumbnail image changes; each erase gesture is one undo step (undo ×3 / redo ×3); save → New → open gives identical objects. Unit: `eraser.test.ts` (splitting, coverage, fast swipes, non-erasable text) | Pass | Eraser does not affect text, equations, images or tables (by design; select + Delete removes them) |
| AC-03 | Shapes and lines | **Verified** | `tools/shapeTools.ts`, `core/geometry.ts`, `core/render.ts` | `drawing.spec.ts › AC-03`: draw all 11 shape presets with alternating drag directions (incl. reverse), alternating fill/none, widths and solid/dashed/dotted; check normalised geometry and styles; draw a right-to-left double-headed dashed arrow; select a shape, change fill and width from the property bar, resize from a handle; save and export a PDF. Unit: `geometry.test.ts` | Pass | Shapes cannot be rotated (resize/move only) |
| AC-04 | Text and mathematical notation | **Verified** | `tools/textTools.ts`, `ui/canvas/Editors.tsx`, `core/text.ts`, `core/math.ts`, `ui/dialogs/MathDialog.tsx` | `content.spec.ts › AC-04`: add text (tool keys don't fire while typing), double-click to edit, bold + font change, move by drag, delete; build an equation from palette buttons (fraction, exponent, nth root, ≤, π); invalid TeX shows an error and blocks insert; multi-line aligned equation; ink pixels rendered; save/reopen identical; PNG export size; double-click to edit an equation. Unit: `misc.test.ts › math notation` | Pass | Formatting is per text box (not per character) |
| AC-05 | Undo and redo | **Verified** | `state/doc.ts`, `core/history.ts` | `content.spec.ts › AC-05`: draw, shape, erase, move, add text, edit text, delete, add page + draw; snapshot after each; undo all the way and redo all the way twice, comparing every intermediate document; lesson returns to "not dirty"; undo while on another page navigates to the changed page. Unit: `history.test.ts` (20×5 cycles, transactions, page navigation, branch discard, selection) | Pass | History is per session (not saved in the file); 300 steps |
| AC-06 | Multiple pages and groups | **Verified** | `ui/panels/PagesPanel.tsx`, `ui/panels/Thumbnail.tsx`, `state/ops.ts`, `core/document.ts` | `documents.spec.ts › AC-06`: per-page backgrounds (grid / chalkboard); add, duplicate (independent ids), numbering 1–3, non-blank thumbnails, select by thumbnail; new section, rename, drag a page into it (numbering 1–4); delete a page with confirmation; save → New → open restores all sections, pages, sizes and backgrounds; the last page cannot be deleted. Unit: `document.test.ts` | Pass | — |
| AC-07 | Save and reopen lessons | **Verified** | `state/files.ts`, `main/index.ts`, `main/storage.ts`, `core/serialization.ts` | `documents.spec.ts › AC-07`: cancelled Save dialog writes nothing; save names the untitled lesson after the file; quit and **restart**; reopen from Recent; content editable; unsaved-changes prompt with Cancel (kept) and Don't Save (discarded, file untouched); closing the window with changes → Save writes the file; restart and verify; invalid file → error message, current lesson kept; cancelled Open does nothing. Unit: `serialization.test.ts` (round trip of every object type, invalid/newer/corrupt files, missing assets) | Pass | — |
| AC-08 | Import and export | **Verified** | `core/exporter.ts`, `core/pdfImport.ts`, `state/files.ts`, `main/print.ts` | `documents.spec.ts › AC-08`: 3-page PDF with mixed sizes (page count + every page size checked with pdf-lib); PNG 1× and JPEG 2× pixel sizes; all pages to a folder; document unchanged by exporting; exported pixels match the drawing; insert image; import a 2-page PDF (new section, pages keep aspect ratio); Save As/Open round trip. `recovery.spec.ts › printing`: print job receives one image per page at the right size and orientation. Unit: `misc.test.ts › PDF export` | Pass | PDF export is raster (text not selectable); imported PDF pages are images; the OS print dialog itself is not exercised by automation |
| AC-09 | Presentation mode | **Verified** | `ui/present/Presentation.tsx` | `presentation.spec.ts › AC-09`: F5 enters full screen from page 1; pixels confirm ink and the chalkboard background; arrows, click and Home navigate and stop at the ends; temporary ink and laser used; Esc exits full screen; document and revision unchanged; Shift+F5 presents the current page; leaving OS full screen ends the presentation | Pass | Single display only (no separate presenter view) |
| AC-10 | Zoom and pan | **Verified** | `core/viewport.ts`, `state/view.ts`, `ui/canvas/CanvasView.tsx` | `drawing.spec.ts › AC-10`: draw at three zoom levels and compare stored page coordinates with the intended ones (≤ 1.5 screen px); hand-tool pan moves exactly by the drag; Ctrl+wheel zooms; resize the window, fit, draw and re-check alignment; export PNG at two zoom levels → identical 3840×2160 output. Unit: `misc.test.ts › viewport transforms` | Pass | — |
| AC-11 | Pen tablet support | **Verified** (synthetic stylus) / **Blocked by a documented limitation** (physical hardware) | `ui/canvas/CanvasView.tsx`, `tools/inkTools.ts`, `core/strokes.ts` | `drawing.spec.ts › AC-11`: Chromium DevTools dispatches real `pointerType: "pen"` events with pressure 0.03–1.0: the stroke records `pressure: true`, the pressure range, and no gaps; a mouse stroke records no pressure | Pass | **No physical pen tablet was available.** Still to verify on hardware: real pressure curves (Wacom/Huion on Windows Ink and macOS), the pen's eraser end (cannot be synthesised), palm/touch behaviour, Apple Pencil via Sidecar |
| AC-12 | Keyboard shortcuts | **Verified** (Windows) / **Implemented, not yet verified** (macOS) | `core/shortcuts.ts`, `shared/commands.ts`, `ui/App.tsx`, `ui/dialogs/SettingsDialog.tsx` | `shortcuts.spec.ts › AC-12`: all 11 tool keys; Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z; copy/paste/duplicate/select all/delete; page navigation; zoom; typing in a text box doesn't trigger tools and Ctrl+Z undoes typing only; Ctrl+S/N/O/Shift+S; tool keys ignored while a dialog is open; conflicting custom key refused with a message; Save cannot lose its only shortcut; custom key works, persists in `settings.json` and survives a restart. Unit: `shortcuts.test.ts` (macOS ⌘ mapping, ⇧⌘Z redo, ⌃⌘F full screen, reserved keys, no default conflicts on either platform) | Pass | macOS behaviour is covered by unit tests and the CI workflow but has not been run on a Mac yet |

**Additional verified behaviour:** crash recovery (`recovery.spec.ts`: an
abrupt exit with unsaved work → snapshot offered on next launch → restored
as an unsaved copy with no file path), settings persistence (theme,
toolbar position), resource library save/insert/delete with confirmation
across restarts, and the calculator placing its result on the page
(`shortcuts.spec.ts › settings, resource library and teaching tools`).

## Windows release

| Check | Status | Result |
|---|---|---|
| Genuine `setup.exe` exists | **Verified** | `release/windows/setup.exe`, 115 MB, NSIS installer (Nullsoft header, `asInvoker` manifest); SHA-256 in `setup.exe.json` |
| Metadata | **Verified** | Product name TeachBoard, version 1.0.0, publisher and copyright from `app.config.json` |
| Installs | **Verified** | `setup.exe /S /D=…` → exit 0; app files, Start-menu and desktop shortcuts, Apps-list entry (1.0.0), `.tboard` association |
| Installed app launches and works | **Verified** | Full end-to-end suite passed against the installed `TeachBoard.exe`; launching it with a lesson path (as a double-click does) opens the lesson, with test hooks absent |
| Package contents | **Verified** | `app.asar` 9 MB, bundled app only; the release step now fails the build if `node_modules` is ever packaged |
| Uninstalls | **Verified** | Uninstaller exit 0; program folder, registry entry, both shortcuts and the `.tboard` association removed |
| Code signing | **Blocked by a documented limitation** | Not signed (no certificate available). SmartScreen warns on first run; see [PACKAGING.md](PACKAGING.md) to sign |

## macOS release

| Check | Status | Notes |
|---|---|---|
| Genuine `setup.dmg` | **Blocked by a documented limitation** | A DMG can only be built on macOS. `npm run dist:mac` and the `macos` job in `.github/workflows/release.yml` are configured (universal binary, Applications link, ad-hoc signing without credentials). |
| Install and launch, core workflows | **Blocked** (as above) | The CI job mounts the DMG, verifies the Applications link, `codesign`, bundle metadata and architectures, copies the app out and runs the full end-to-end suite against it. |
| Signing / notarisation | **Blocked by a documented limitation** | Needs an Apple Developer ID and Apple ID credentials (repository secrets listed in PACKAGING.md). Without them, Gatekeeper requires right-click → Open on first launch. |

## Cross-platform consistency

| Check | Status | Notes |
|---|---|---|
| Same file format on both OSes | **Implemented, not yet verified on macOS** | The format has no absolute paths or platform data; fonts are bundled; files are plain ZIP + JSON (unit-tested round trips). |
| Transfer of lessons Windows ↔ macOS | **Implemented, not yet verified** | Needs a lesson saved on one OS opened on the other. |
| Platform shortcut conventions | **Verified (Windows), unit-tested (macOS)** | See AC-12. |

## Feature summary

**Implemented and verified:** everything in AC-01 to AC-12 above, plus
polygons; tables (cell editing, add/remove rows and columns); 14
background templates and 9 patterns with custom colours and background
images; page sizes (8 presets + custom, per page/section/all, optional
content scaling); resource library (51 built-in symbols in 5 subjects + user
groups); timer/stopwatch, calculator, random picker, ruler with
straight-edge drawing, protractor, magnifier, spotlight, screen shade, laser
pointer; light/dark theme; toolbar customisation; crash recovery; recent
files; drag-and-drop of images, PDFs and lessons; clipboard exchange with
other apps.

**Partially implemented:** PDF export is raster only; stylus support is
verified with synthetic events only; rich text is per box, not per
character.

**Not available:** interface languages other than English; object
rotation; vector PDF export; a separate presenter view on a second display;
cloud sync or collaboration (out of scope — the app is local-only by design).
