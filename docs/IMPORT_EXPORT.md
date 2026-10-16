# Import and export

Everything here works offline. Exports never modify the open lesson and
are rendered from the document itself, so the current zoom, pan, selection
or open panels have no effect on the output.

## Supported formats

| Format | Direction | Where | Notes |
|---|---|---|---|
| **`.tboard` lesson** | open / save / save as | File menu, ⌘/Ctrl+O, ⌘/Ctrl+S, ⇧⌘/Ctrl+Shift+S, drag a file onto the window, double-click a file (file association) | Fully editable. See [FILE_FORMAT.md](FILE_FORMAT.md). |
| **PDF** | export | File → Export → PDF (⌘/Ctrl+Shift+E) | Current page, current section, or all pages. One PDF sheet per page, sized to the page (96 px per inch). |
| **PNG** | export | File → Export → PNG | Current page, section or all pages. Multiple pages are written as separate files into a chosen folder. |
| **JPEG** | export | File → Export → JPEG | As PNG; white page backgrounds stay white (no transparency). |
| **Print** | output | File → Print… (⌘/Ctrl+P), or Print in the Export dialog | Opens the operating system's print dialog; one page per sheet, scaled to fit, orientation from the first page. |
| **PDF** | import | File → Import PDF as Pages…, Insert ▸ PDF, or drop a PDF on the canvas | Each PDF page becomes a lesson page (in a new section named after the file) with the PDF page as its background image; annotate on top. |
| **Images** (PNG, JPEG, GIF, WebP, BMP, SVG) | insert | Insert ▸ Image (⌘/Ctrl+Shift+I), paste, or drag onto the canvas | Inserted as movable, resizable image objects; stored inside the lesson. |
| **Background image** | insert | Page Background panel → Choose image… | Fill / Fit / Stretch / Centre. |
| **Clipboard** | copy / paste | ⌘/Ctrl+C, X, V | Within the app, objects stay fully editable. Copying also places plain text (text, equation source, table cells) and a PNG picture of the selection on the system clipboard for other apps. Pasting an image or text from another app inserts it. |

## Quality settings

The Export dialog offers Standard (1×), High (2×, default) and Print (3×).
A 1920 × 1080 page exports as 1920 × 1080, 3840 × 2160 or 5760 × 3240
pixels respectively. Very large pages are capped to stay within Chromium's
canvas limits (12 000 px per side).

## How PDF export works (and its limits)

Each page is rendered at the chosen scale with the same renderer used on
screen and embedded as an image (PNG for ink and shapes, JPEG for pages
that contain photos or PDF backgrounds, to keep files small).

* **Text in exported PDFs is not selectable or searchable** — it is part of
  the page image. The editable source is always the `.tboard` file.
* Vector output is not offered in this version.

## How PDF import works (and its limits)

PDF pages are rasterised with pdf.js at 1.5× the board resolution (the
long side of each page maps to 1920 board pixels, keeping the PDF's aspect
ratio) and stored as JPEG backgrounds. PDF text and links are not
editable after import. Up to 300 pages are imported from one file;
password-protected PDFs are not supported.

## Verification

Automated end-to-end tests ([`tests/e2e/documents.spec.ts`](../tests/e2e/documents.spec.ts),
AC-08) export a three-page lesson with mixed page sizes to PDF and check
the page count and every page size with pdf-lib; export PNG and JPEG and
check their pixel dimensions; check exported pixels against the drawing;
export all pages to a folder; insert an image; import a generated
two-page PDF; and round-trip the lesson through Save As/Open — confirming
the document is byte-for-byte unchanged by exporting.
