// Renders build/icon.svg to the PNG sizes used for packaging.
// electron-builder derives the Windows .ico and macOS .icns from build/icon.png.
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'build/icon.svg'), 'utf8')

for (const [name, size] of [
  ['icon.png', 1024],
  ['icon-256.png', 256]
]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
  writeFileSync(join(root, 'build', name), png)
  console.log(`build/${name} (${size}×${size})`)
}
