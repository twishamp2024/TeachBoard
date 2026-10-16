/** Colour utilities shared by rendering and UI. */

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex.trim())
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const rgb = parseHex(hex)
  if (!rgb) return 1
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function isDarkColor(hex: string): boolean {
  return luminance(hex) < 0.22
}

export function isValidHex(hex: string): boolean {
  return parseHex(hex) !== null
}

export function normalizeHex(hex: string): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
}
