import { PDFDocument } from 'pdf-lib'
import type { LessonDocument, Page } from './model'
import { renderPageToCanvas } from './render'
import { ensureFontsLoaded, type ResourceCache } from './resources'

/** CSS pixels → PDF points (1/72 inch, assuming 96 px per inch). */
export const PX_TO_PT = 72 / 96

export interface RasterPage {
  /** PNG or JPEG bytes. */
  bytes: Uint8Array
  kind: 'png' | 'jpeg'
  width: number
  height: number
}

export interface PdfMeta {
  title: string
  producer: string
}

/**
 * Builds a PDF with one sheet per page, each sized to the page's own
 * dimensions. Pages are embedded as high-resolution images.
 */
export async function buildPdf(pages: RasterPage[], meta: PdfMeta): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(meta.title)
  pdf.setProducer(meta.producer)
  pdf.setCreator(meta.producer)
  pdf.setCreationDate(new Date())
  for (const p of pages) {
    const img = p.kind === 'png' ? await pdf.embedPng(p.bytes) : await pdf.embedJpg(p.bytes)
    const w = p.width * PX_TO_PT
    const h = p.height * PX_TO_PT
    const sheet = pdf.addPage([w, h])
    sheet.drawImage(img, { x: 0, y: 0, width: w, height: h })
  }
  return pdf.save()
}

export function canvasToBytes(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality = 0.92): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Could not encode the image'))
        blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject)
      },
      type,
      quality
    )
  })
}

/** Keeps exported bitmaps within Chromium's canvas limits. */
export function safeScale(page: Page, scale: number): number {
  const maxSide = 12000
  const maxArea = 120_000_000
  let s = scale
  s = Math.min(s, maxSide / page.width, maxSide / page.height)
  s = Math.min(s, Math.sqrt(maxArea / (page.width * page.height)))
  return Math.max(0.1, s)
}

export async function rasterizePage(
  doc: LessonDocument,
  page: Page,
  resources: ResourceCache,
  scale: number,
  type: 'image/png' | 'image/jpeg' = 'image/png'
): Promise<RasterPage> {
  await ensureFontsLoaded()
  await resources.ensurePages(doc, [page])
  const canvas = renderPageToCanvas(page, { doc, resources }, safeScale(page, scale))
  const bytes = await canvasToBytes(canvas, type)
  return { bytes, kind: type === 'image/png' ? 'png' : 'jpeg', width: page.width, height: page.height }
}

export async function exportPdf(
  doc: LessonDocument,
  pages: Page[],
  resources: ResourceCache,
  scale: number,
  producer: string,
  onProgress?: (done: number, total: number) => void
): Promise<Uint8Array> {
  const rasters: RasterPage[] = []
  for (let i = 0; i < pages.length; i++) {
    // JPEG keeps photo-heavy lessons small; ink-only pages stay crisp as PNG.
    const photo = pages[i].background.imageAssetId || pages[i].objects.some((o) => o.type === 'image')
    rasters.push(await rasterizePage(doc, pages[i], resources, scale, photo ? 'image/jpeg' : 'image/png'))
    onProgress?.(i + 1, pages.length)
  }
  return buildPdf(rasters, { title: doc.title, producer })
}

export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Lesson'
}
