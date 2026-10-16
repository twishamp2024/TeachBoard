import { protocol } from 'electron'
import { promises as fs } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'

export const APP_SCHEME = 'app'
export const APP_ORIGIN = `${APP_SCHEME}://bundle`

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream'
}

/**
 * Content Security Policy for the packaged renderer. Everything is bundled
 * locally; no remote origins are allowed.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ')

/** Must run before the app is ready. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
  ])
}

/** Serves the built renderer from `rootDir` over app://bundle/… */
export function serveRenderer(rootDir: string): void {
  const root = normalize(rootDir)
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.host !== 'bundle') return new Response('Not found', { status: 404 })
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
    const full = normalize(join(root, rel))
    // Refuse anything that escapes the bundle directory.
    if (full !== root && !full.startsWith(root + sep)) return new Response('Forbidden', { status: 403 })
    try {
      const data = await fs.readFile(full)
      const type = MIME[extname(full).toLowerCase()] ?? 'application/octet-stream'
      return new Response(data, {
        headers: {
          'Content-Type': type,
          'Content-Security-Policy': CSP,
          'X-Content-Type-Options': 'nosniff'
        }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
