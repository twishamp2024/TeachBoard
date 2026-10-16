import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { RecentFile, RecoveryEntry } from '../shared/ipc'

const MAX_STORE_BYTES = 64 * 1024 * 1024
const MAX_RECENT = 12

/** Writes a file atomically: write to a sibling temp file, then rename over the target. */
export async function writeFileAtomic(path: string, data: Uint8Array | string): Promise<void> {
  const tmp = join(dirname(path), `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`)
  try {
    await fs.writeFile(tmp, data)
    await fs.rename(tmp, path)
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => undefined)
    throw err
  }
}

function dataDir(...parts: string[]): string {
  return join(app.getPath('userData'), ...parts)
}

async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true })
}

// ---------------------------------------------------------------------------
// JSON stores (settings, resource library, UI layout)

const STORE_NAMES = new Set(['settings', 'resources', 'ui'])

export async function readStore(name: string): Promise<unknown> {
  if (!STORE_NAMES.has(name)) throw new Error(`Unknown store: ${name}`)
  try {
    const text = await fs.readFile(dataDir(`${name}.json`), 'utf8')
    return JSON.parse(text)
  } catch {
    return null
  }
}

export async function writeStore(name: string, value: unknown): Promise<void> {
  if (!STORE_NAMES.has(name)) throw new Error(`Unknown store: ${name}`)
  const text = JSON.stringify(value)
  if (text.length > MAX_STORE_BYTES) throw new Error('Store is too large')
  await ensureDir(dataDir())
  await writeFileAtomic(dataDir(`${name}.json`), text)
}

// ---------------------------------------------------------------------------
// Recent files

export async function listRecent(): Promise<RecentFile[]> {
  const raw = await readStoreFile('recent.json')
  if (!Array.isArray(raw)) return []
  const items = raw.filter(
    (r): r is RecentFile => typeof r?.path === 'string' && typeof r?.name === 'string' && typeof r?.openedAt === 'number'
  )
  // Drop files that no longer exist so the menu never offers a dead entry.
  const checks = await Promise.all(items.map((r) => fs.access(r.path).then(() => true, () => false)))
  return items.filter((_, i) => checks[i])
}

export async function addRecent(path: string): Promise<RecentFile[]> {
  const list = (await listRecent()).filter((r) => r.path.toLowerCase() !== path.toLowerCase())
  list.unshift({ path, name: basename(path), openedAt: Date.now() })
  const trimmed = list.slice(0, MAX_RECENT)
  await writeStoreFile('recent.json', trimmed)
  try {
    app.addRecentDocument(path)
  } catch {
    // OS recent-document integration is best-effort.
  }
  return trimmed
}

export async function clearRecent(): Promise<void> {
  await writeStoreFile('recent.json', [])
  try {
    app.clearRecentDocuments()
  } catch {
    // best-effort
  }
}

async function readStoreFile(name: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(dataDir(name), 'utf8'))
  } catch {
    return null
  }
}

async function writeStoreFile(name: string, value: unknown): Promise<void> {
  await ensureDir(dataDir())
  await writeFileAtomic(dataDir(name), JSON.stringify(value))
}

// ---------------------------------------------------------------------------
// Crash recovery snapshots. These live only in the app-data directory and
// never overwrite the user's own files.

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/

function recoveryPath(id: string, ext: 'tboard' | 'json'): string {
  if (!SAFE_ID.test(id)) throw new Error('Invalid recovery id')
  return dataDir('recovery', `${id}.${ext}`)
}

export async function writeRecovery(entry: RecoveryEntry, bytes: Uint8Array): Promise<void> {
  await ensureDir(dataDir('recovery'))
  await writeFileAtomic(recoveryPath(entry.id, 'tboard'), bytes)
  await writeFileAtomic(recoveryPath(entry.id, 'json'), JSON.stringify(entry))
}

export async function listRecovery(): Promise<RecoveryEntry[]> {
  let names: string[] = []
  try {
    names = await fs.readdir(dataDir('recovery'))
  } catch {
    return []
  }
  const out: RecoveryEntry[] = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    try {
      const entry = JSON.parse(await fs.readFile(dataDir('recovery', name), 'utf8')) as RecoveryEntry
      await fs.access(recoveryPath(entry.id, 'tboard'))
      out.push(entry)
    } catch {
      // ignore broken entries
    }
  }
  return out.sort((a, b) => b.savedAt - a.savedAt)
}

export async function readRecovery(id: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await fs.readFile(recoveryPath(id, 'tboard')))
  } catch {
    return null
  }
}

export async function clearRecovery(id: string): Promise<void> {
  await fs.rm(recoveryPath(id, 'tboard'), { force: true })
  await fs.rm(recoveryPath(id, 'json'), { force: true })
}
