// Copies the platform installer into release/<platform>/ and records its
// size and SHA-256 next to it.
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const platform = process.argv[2]
const map = { win: ['windows', 'setup.exe'], mac: ['macos', 'setup.dmg'] }
if (!map[platform]) {
  console.error('usage: collect-release.mjs win|mac')
  process.exit(1)
}
const [folder, file] = map[platform]
const app = JSON.parse(readFileSync(join(root, 'app.config.json'), 'utf8'))
const built = `${app.appName}-Setup-${app.version}.${file.split('.').pop()}`
const src = join(root, 'dist', folder, built)
if (!existsSync(src)) {
  console.error(`Expected installer not found: ${src}`)
  process.exit(1)
}

// The renderer and main process are fully bundled by Vite, so the packaged
// app must contain no node_modules. Refuse to publish a bloated build.
const asarPath =
  platform === 'win'
    ? join(root, 'dist', folder, 'win-unpacked', 'resources', 'app.asar')
    : join(root, 'dist', folder, 'mac-universal', `${app.appName}.app`, 'Contents', 'Resources', 'app.asar')
if (existsSync(asarPath)) {
  const asar = createRequire(import.meta.url)('@electron/asar')
  const entries = asar.listPackage(asarPath)
  if (entries.some((e) => /^[\\/]?node_modules([\\/]|$)/.test(e))) {
    console.error(`${asarPath} contains node_modules; runtime libraries must be devDependencies (they are bundled).`)
    process.exit(1)
  }
} else {
  console.warn(`Could not find ${asarPath}; skipped the package-content check.`)
}

const outDir = join(root, 'release', folder)
mkdirSync(outDir, { recursive: true })
const dest = join(outDir, file)
copyFileSync(src, dest)
const bytes = readFileSync(dest)
const info = {
  app: app.appName,
  version: app.version,
  file,
  builtAs: built,
  bytes: statSync(dest).size,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  builtAt: new Date().toISOString(),
  builtOn: `${process.platform}-${process.arch}`
}
writeFileSync(join(outDir, `${file}.json`), JSON.stringify(info, null, 2) + '\n')
console.log(`${dest}\n${JSON.stringify(info, null, 2)}`)
