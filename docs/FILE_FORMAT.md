# Lesson file format (`.tboard`), version 1

A lesson is a single file with the extension `.tboard`
(configured in `app.config.json → fileExtension`). It is a standard ZIP
archive, so it can be inspected with any unzip tool. The same file opens on
Windows and macOS — it contains no absolute paths and no platform-specific
data.

Source of truth: [`src/renderer/src/core/serialization.ts`](../src/renderer/src/core/serialization.ts)
(writer, reader, validation schemas and migrations) and
[`src/renderer/src/core/model.ts`](../src/renderer/src/core/model.ts) (types).

## Container layout

| Entry | Required | Description |
|---|---|---|
| `mimetype` | yes | The ASCII string `application/x-teachboard`. Stored uncompressed as the first entry so the type can be sniffed. |
| `manifest.json` | yes | `{ "format": "teachboard-lesson", "formatVersion": 1, "appName", "appVersion", "savedAt" }` |
| `document.json` | yes | The lesson content (below). |
| `assets/<id>.<ext>` | when used | Binary assets (PNG, JPEG, GIF, WebP, BMP, SVG) referenced by id. Only assets used by a page are written. |
| `preview.png` | no | A ~480 px preview of the first page, for file browsers and future thumbnails. Never required for opening. |

## `document.json`

```jsonc
{
  "id": "d…",                      // stable lesson id
  "title": "Fractions – Week 3",
  "createdAt": "2026-10-16T…Z",
  "modifiedAt": "2026-10-16T…Z",
  "pageDefaults": {                // used for new pages in this lesson
    "width": 1920, "height": 1080,
    "background": { …Background }
  },
  "sections": [                    // groups of pages, in order
    { "id": "s…", "name": "Section 1", "collapsed": false, "pages": [ …Page ] }
  ],
  "assets": [                      // metadata; bytes live in assets/
    { "id": "a…", "mime": "image/png", "name": "photo.png", "path": "assets/a….png" }
  ]
}
```

Page order is the order of sections, then the order of pages within each
section. Page numbers are derived (1-based, across the whole lesson).

### Coordinates

All geometry is in **page pixels** — CSS pixels at 100 % zoom, with the
origin at the page's top-left corner. Zoom and pan are view state and are
never stored. Export maps page pixels to output at 96 px per inch, so a
1920 × 1080 page becomes a 1440 × 810 pt PDF page.

### Page

```jsonc
{ "id": "p…", "width": 1920, "height": 1080, "background": { …Background }, "objects": [ …Object ] }
```

`width`/`height` are 50–20 000. Objects are painted in array order (last is on top).

### Background

```jsonc
{
  "color": "#FFFFFF",
  "pattern": "none | grid | graph | dots | lines | handwriting | music | isometric | coordinate",
  "patternColor": "#C9D3DE",
  "spacing": 40,                   // page pixels, 4–1000
  "imageAssetId": null,            // or an asset id
  "imageFit": "cover | contain | stretch | center"
}
```

### Objects

Every object has `id` and `type`. Colours are `#RRGGBB` strings.

| `type` | Fields |
|---|---|
| `stroke` | `tool` (`pen`/`highlighter`), `style` (`pen`/`marker`/`dashed`), `color`, `width`, `opacity` (0–1), `points` = flat `[x, y, pressure, …]` triplets (pressure 0–1), `pressure` (true when recorded from a pressure-sensitive device) |
| `shape` | `kind` (`rect`, `roundRect`, `ellipse`, `triangle`, `rightTriangle`, `diamond`, `parallelogram`, `trapezoid`, `pentagon`, `hexagon`, `star`), `x`, `y`, `w`, `h`, `stroke`, `fill` (colour or `null`), `strokeWidth`, `dash` (`solid`/`dashed`/`dotted`), `flipX`, `flipY` |
| `line` | `x1`, `y1`, `x2`, `y2`, `stroke`, `strokeWidth`, `dash`, `startCap`/`endCap` (`none`/`arrow`/`dot`) |
| `polygon` | `points` = flat `[x, y, …]`, `closed`, `stroke`, `fill`, `strokeWidth`, `dash` |
| `text` | `x`, `y`, `w`, `h` (laid-out height), `text` (plain text, `\n` for new lines), `fontFamily`, `fontSize`, `color`, `bold`, `italic`, `underline`, `align` (`left`/`center`/`right`), `background` |
| `math` | `x`, `y`, `w`, `h`, `latex` (editable TeX source; multiple lines are rows, `&` aligns), `color`, `fontSize` |
| `image` | `x`, `y`, `w`, `h`, `assetId`, `opacity`, `name` |
| `table` | `x`, `y`, `colWidths[]`, `rowHeights[]`, `cells[row][col]` (strings), `stroke`, `strokeWidth`, `fill`, `headerFill`, `color`, `fontFamily`, `fontSize` |

Equations are stored as TeX source, not as images, so they stay editable;
they are typeset with the bundled MathJax when the lesson is opened.
Fonts are referenced by family name; the application bundles Atkinson
Hyperlegible, Inter, Merriweather, Patrick Hand and JetBrains Mono so text
renders identically on both platforms.

## Versioning and compatibility

* `manifest.formatVersion` is an integer. This release writes **1**.
* Readers open any version ≤ their own, running `migrate()` steps in order.
* A file with a **newer** version is refused with a clear message (“created
  with a newer version… please update”) rather than being half-read.
* Unknown extra fields are ignored. Every known field is validated with a
  schema; an invalid file is rejected with the path of the first problem.
* If an asset file is missing, the lesson still opens; objects and
  backgrounds that referenced it are dropped and the user is warned.

## Saving safely

Files are written atomically: the bytes go to a temporary file in the same
folder, which then replaces the target. A crash during saving can therefore
never leave a half-written lesson. Unsaved work is additionally snapshotted
to the app-data `recovery/` folder (see [ARCHITECTURE.md](ARCHITECTURE.md)),
never next to or over the user's own file.
