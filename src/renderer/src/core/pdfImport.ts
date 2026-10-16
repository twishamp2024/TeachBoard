import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { canvasToBytes } from './exporter'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export interface ImportedPdfPage {
  /** Page size in board pixels. */
  width: number
  height: number
  image: Uint8Array
  mime: string
}

/**
 * Renders each PDF page to a bitmap that becomes a page background. The
 * board page keeps the PDF page's aspect ratio, with its longer side scaled
 * to `targetLongSide` board pixels.
 */
export async function importPdf(
  bytes: Uint8Array,
  opts: { targetLongSide?: number; pixelRatio?: number; maxPages?: number; onProgress?: (done: number, total: number) => void } = {}
): Promise<ImportedPdfPage[]> {
  const target = opts.targetLongSide ?? 1920
  const ratio = opts.pixelRatio ?? 1.5
  // pdf.js takes ownership of the buffer, so give it a copy.
  const task = pdfjs.getDocument({ data: bytes.slice() })
  const pdf = await task.promise
  const total = Math.min(pdf.numPages, opts.maxPages ?? 300)
  const out: ImportedPdfPage[] = []
  try {
    for (let n = 1; n <= total; n++) {
      const page = await pdf.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const boardScale = target / Math.max(base.width, base.height)
      const width = Math.round(base.width * boardScale)
      const height = Math.round(base.height * boardScale)
      const viewport = page.getViewport({ scale: boardScale * ratio })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      out.push({ width, height, image: await canvasToBytes(canvas, 'image/jpeg', 0.9), mime: 'image/jpeg' })
      page.cleanup()
      opts.onProgress?.(n, total)
    }
  } finally {
    await task.destroy()
  }
  return out
}
