import { create } from 'zustand'
import { newId } from '../core/document'
import type { Asset, BoardObject } from '../core/model'
import { api } from '../platform'

/**
 * The user's own resource library, persisted as resources.json in the
 * app-data directory. Items hold board objects (and any image assets they
 * use) so they stay editable when inserted.
 */
export interface LibraryAsset {
  id: string
  mime: string
  name: string
  base64: string
}

export interface LibraryItem {
  id: string
  name: string
  createdAt: number
  preview: string
  objects: BoardObject[]
  assets: LibraryAsset[]
}

export interface LibraryGroup {
  id: string
  name: string
  items: LibraryItem[]
}

interface LibraryStore {
  groups: LibraryGroup[]
  loaded: boolean
  load(): Promise<void>
  addGroup(name: string): string
  renameGroup(id: string, name: string): void
  removeGroup(id: string): void
  addItem(groupId: string, item: Omit<LibraryItem, 'id' | 'createdAt'>): void
  renameItem(groupId: string, itemId: string, name: string): void
  removeItem(groupId: string, itemId: string): void
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(s)
}

export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

export function toLibraryAssets(assets: Asset[]): LibraryAsset[] {
  return assets.map((a) => ({ id: a.id, mime: a.mime, name: a.name, base64: bytesToBase64(a.data) }))
}

export function fromLibraryAssets(assets: LibraryAsset[]): Asset[] {
  return assets.map((a) => ({ id: a.id, mime: a.mime, name: a.name, data: base64ToBytes(a.base64) }))
}

function sanitize(raw: unknown): LibraryGroup[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { groups?: unknown }).groups)) return []
  const groups = (raw as { groups: unknown[] }).groups
  return groups
    .filter((g): g is LibraryGroup => !!g && typeof (g as LibraryGroup).id === 'string' && typeof (g as LibraryGroup).name === 'string' && Array.isArray((g as LibraryGroup).items))
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => i && typeof i.id === 'string' && Array.isArray(i.objects) && Array.isArray(i.assets))
    }))
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function persist(groups: LibraryGroup[]) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    api.writeStore('resources', { version: 1, groups }).catch((err) => console.error('Could not save the library', err))
  }, 200)
}

export const useLibrary = create<LibraryStore>((set, get) => {
  const update = (groups: LibraryGroup[]) => {
    set({ groups })
    persist(groups)
  }
  return {
    groups: [],
    loaded: false,
    async load() {
      if (get().loaded) return
      const raw = await api.readStore('resources').catch(() => null)
      const groups = sanitize(raw)
      set({ groups: groups.length ? groups : [{ id: newId('g'), name: 'My Resources', items: [] }], loaded: true })
    },
    addGroup(name) {
      const id = newId('g')
      update([...get().groups, { id, name: name.trim().slice(0, 80) || 'New Group', items: [] }])
      return id
    },
    renameGroup(id, name) {
      const clean = name.trim().slice(0, 80)
      if (!clean) return
      update(get().groups.map((g) => (g.id === id ? { ...g, name: clean } : g)))
    },
    removeGroup(id) {
      update(get().groups.filter((g) => g.id !== id))
    },
    addItem(groupId, item) {
      update(get().groups.map((g) => (g.id === groupId ? { ...g, items: [...g.items, { ...item, id: newId('r'), createdAt: Date.now() }] } : g)))
    },
    renameItem(groupId, itemId, name) {
      const clean = name.trim().slice(0, 80)
      if (!clean) return
      update(get().groups.map((g) => (g.id === groupId ? { ...g, items: g.items.map((i) => (i.id === itemId ? { ...i, name: clean } : i)) } : g)))
    },
    removeItem(groupId, itemId) {
      update(get().groups.map((g) => (g.id === groupId ? { ...g, items: g.items.filter((i) => i.id !== itemId) } : g)))
    }
  }
})
