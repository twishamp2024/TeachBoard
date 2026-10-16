import { allPages } from './document'
import { renderMath } from './math'
import type { Asset, LessonDocument, MathObject, Page } from './model'

/**
 * Decoded images for assets and rendered equations, shared by the canvas,
 * thumbnails, presentation and exports. Loading is asynchronous; listeners
 * are notified so views can redraw when an image becomes ready.
 */
interface Entry {
  img: HTMLImageElement
  ready: boolean
  failed: boolean
  promise: Promise<void>
  url: string
}

export class ResourceCache {
  private assets = new Map<string, Entry>()
  private math = new Map<string, Entry>()
  private listeners = new Set<() => void>()
  private notifyScheduled = false
  version = 0

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private notify(): void {
    this.version++
    if (this.notifyScheduled) return
    this.notifyScheduled = true
    queueMicrotask(() => {
      this.notifyScheduled = false
      for (const fn of this.listeners) fn()
    })
  }

  private load(url: string): Entry {
    const img = new Image()
    img.decoding = 'async'
    const entry: Entry = { img, ready: false, failed: false, url, promise: Promise.resolve() }
    entry.promise = new Promise<void>((resolve) => {
      img.onload = () => {
        entry.ready = true
        this.notify()
        resolve()
      }
      img.onerror = () => {
        entry.failed = true
        this.notify()
        resolve()
      }
    })
    img.src = url
    return entry
  }

  assetImage(asset: Asset | undefined): HTMLImageElement | null {
    if (!asset) return null
    let e = this.assets.get(asset.id)
    if (!e) {
      const blob = new Blob([asset.data as BlobPart], { type: asset.mime })
      e = this.load(URL.createObjectURL(blob))
      this.assets.set(asset.id, e)
    }
    return e.ready ? e.img : null
  }

  assetFailed(assetId: string): boolean {
    return !!this.assets.get(assetId)?.failed
  }

  mathKey(o: Pick<MathObject, 'latex' | 'color'>): string {
    return `${o.color}\u0000${o.latex}`
  }

  mathImage(o: Pick<MathObject, 'latex' | 'color'>): HTMLImageElement | null {
    const key = this.mathKey(o)
    let e = this.math.get(key)
    if (!e) {
      let svg: string
      try {
        svg = renderMath(o.latex, o.color, 48).svg
      } catch {
        svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>`
      }
      e = this.load(URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })))
      this.math.set(key, e)
      if (this.math.size > 500) this.evictMath()
    }
    return e.ready ? e.img : null
  }

  private evictMath(): void {
    const keys = [...this.math.keys()].slice(0, 100)
    for (const k of keys) {
      URL.revokeObjectURL(this.math.get(k)!.url)
      this.math.delete(k)
    }
  }

  /** Resolves when every image used by the given pages has loaded (or failed). */
  async ensurePages(doc: LessonDocument, pages: Page[] = allPages(doc)): Promise<void> {
    const waits: Promise<void>[] = []
    for (const page of pages) {
      const bg = page.background.imageAssetId
      if (bg && doc.assets[bg]) {
        this.assetImage(doc.assets[bg])
        waits.push(this.assets.get(bg)!.promise)
      }
      for (const o of page.objects) {
        if (o.type === 'image' && doc.assets[o.assetId]) {
          this.assetImage(doc.assets[o.assetId])
          waits.push(this.assets.get(o.assetId)!.promise)
        } else if (o.type === 'math') {
          this.mathImage(o)
          waits.push(this.math.get(this.mathKey(o))!.promise)
        }
      }
    }
    await Promise.all(waits)
  }

  /** Releases decoded assets that are no longer part of the document. */
  prune(doc: LessonDocument): void {
    for (const [id, e] of this.assets) {
      if (!doc.assets[id]) {
        URL.revokeObjectURL(e.url)
        this.assets.delete(id)
      }
    }
  }
}

export const resources = new ResourceCache()

/** Ensures the bundled fonts are ready before measuring or exporting text. */
export async function ensureFontsLoaded(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  const families = ['Atkinson Hyperlegible', 'Inter', 'Merriweather', 'Patrick Hand', 'JetBrains Mono']
  const loads: Promise<unknown>[] = []
  for (const f of families) {
    loads.push(document.fonts.load(`400 16px "${f}"`), document.fonts.load(`700 16px "${f}"`), document.fonts.load(`italic 400 16px "${f}"`))
  }
  await Promise.allSettled(loads)
  await document.fonts.ready
}
