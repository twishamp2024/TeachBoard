# Design system

TeachBoard is designed for teaching at an interactive board as much as at a
desk: the canvas dominates, the most-used tools sit where a standing
teacher can reach them, and everything else is one click away without
covering the page.

## Principles

1. **The page is the hero.** Chrome is quiet, neutral and thin; the page
   floats on a softly dotted workspace with a drop shadow.
2. **Reach.** The tool dock is a floating pill at the bottom centre (it can
   move to the left edge in Settings → Toolbar). Undo/redo are in the dock
   as well as the top bar so they can be reached at a wall-mounted board.
3. **Context, not clutter.** Tool options appear in a property bar just
   above the dock, only for the active tool or selection.
4. **Nothing inert.** Every visible control does something; unavailable
   actions are disabled with a reason, never decorative.
5. **Same lesson everywhere.** Bundled fonts and a single renderer make
   the editor, thumbnails, presentation and exports match.

## Layout

```
┌ Top bar (46 px): ☰ · pages · open · save · title/status │ undo redo · zoom │ background · export · settings · Present ┐
├ Pages panel (212 px)  ┬ Stage ────────────────────────────────────────────────────────────── Drawer (320 px, resizable) ┤
│ sections, thumbnails, │   page on dotted workspace         floating widgets (timer…)        Background / Resources     │
│ drag to reorder       │          ┌ property bar ┐                                           pin · close               │
│ + New page            │          └ tool dock ───┘                                 page nav ‹ 3 / 12 › +              │
└───────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

* **Drawer**: overlays the right side of the stage, resizable (260–560 px),
  pinnable. Unpinned, it gets out of the way when you pick a drawing tool.
* **Floating widgets** (timer, calculator, random picker) are draggable and
  remember their position for the session; the magnifier, spotlight and
  shade are stage overlays; the ruler and protractor live in page space
  and zoom with the page.
* **Dialogs** are modal, centred, focus-trapped, Esc-to-close.

## Colour tokens (`src/renderer/src/styles/tokens.css`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--c-workspace` | `#E6E9ED` | `#121418` | Canvas surround |
| `--c-surface` | `#FFFFFF` | `#1C1F25` | Bars, panels, dialogs |
| `--c-surface-2/3` | `#F5F6F8` / `#ECEEF2` | `#22262D` / `#2A2F37` | Secondary surfaces, tracks |
| `--c-border(-strong)` | `#DDE1E6` / `#C5CBD3` | `#313740` / `#434A55` | Hairlines, inputs |
| `--c-text / -2 / -3` | `#1E2228` / `#545C68` / `#848C98` | `#E6E8EB` / `#AAB1BC` / `#7D8591` | Primary, secondary, tertiary text |
| `--c-accent` | `#0F8B78` | `#2FB9A1` | "Board green": active tool, primary buttons, selection |
| `--c-accent-soft` | `#DCF2ED` | 17 % accent | Selected backgrounds |
| `--c-danger` | `#C23434` | `#EF6B6B` | Destructive actions |
| `--c-focus` | `#1C7ED6` | `#5AA9F0` | Keyboard focus ring (distinct from selection) |

Text/background pairs meet WCAG AA (≥ 4.5:1 for body text; the accent text
token `--c-accent-text` is used for accent-coloured labels on soft
backgrounds). The page itself keeps its own colours in both themes.

## Typography

* UI: the platform's system font (`Segoe UI Variable` on Windows,
  `SF Pro` on macOS) for a native feel — 11/12/13/15/18/22 px scale.
* Board text: bundled **Atkinson Hyperlegible** (default — designed for
  legibility), **Inter**, **Merriweather** (serif), **Patrick Hand**
  (handwriting) and **JetBrains Mono** (code). All OFL-licensed.
* Equations: MathJax's TeX fonts, embedded as paths in the generated SVG.

## Shape, spacing, elevation

* Spacing scale 4 / 8 / 12 / 16 / 20 / 24 / 32 px.
* Radii 6 (inputs), 9 (buttons), 13 (cards, dock buttons), 18 (dock, dialogs), pill.
* Elevation: `--shadow-1` (controls), `--shadow-2` (floating bars),
  `--shadow-3` (dock, drawer, dialogs, menus). Floating bars use a
  translucent "glass" surface with backdrop blur.

## Controls

* **Tool buttons**: 44 × 44 px (touch-friendly). Active state is a filled
  accent tile with a soft glow — unmistakable from across a classroom.
  Buttons with sub-menus show a small chevron; clicking an active Shapes
  button (or right-clicking) opens its flyout.
* **Icon buttons**: 28/34/44 px; hover tint; pressed state; disabled at
  38 % opacity.
* **Tooltips**: every icon has an accessible name and a tooltip that
  includes its current keyboard shortcut (which updates when shortcuts
  are customised).
* **Segmented controls** for small exclusive choices; **chips** for
  filters and templates; **swatches** for colours with a visible ring for
  the active colour, plus a custom colour picker.
* **Colour buttons** (swatch + label) open a palette popover where space is
  tight (shape outline/fill, line colour).

## Icons

[Lucide](https://lucide.dev) (ISC licence) for UI icons at 1.75–1.9 px
stroke. Shape icons are generated from the same geometry code that draws
the shapes, so the icon always matches the result. The application icon
(`build/icon.svg`) is original: a whiteboard on an easel with a pen stroke
and highlighter swipe on a board-green tile.

## Motion

Short (110–260 ms) ease-out transitions for popovers, drawers, dialogs and
toasts. All motion is disabled under `prefers-reduced-motion`.

## Accessibility

* Full keyboard access: tools, commands, page list (arrow keys), menus
  (arrow keys), dialogs (focus trap, Esc), sliders and segmented controls.
* Visible focus rings (blue, distinct from the green selection colour).
* ARIA roles/labels for toolbars, menus, dialogs, tabs, radio groups,
  live regions for status and toasts.
* Light and dark themes, following the system by default.
