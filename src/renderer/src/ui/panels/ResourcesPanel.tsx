import { useEffect, useMemo, useState } from 'react'
import { FolderPlus, ImagePlus, MoreHorizontal, Plus, Search } from 'lucide-react'
import { newId } from '../../core/document'
import type { ImageObject } from '../../core/model'
import { api } from '../../platform'
import { insertObjectsCentered } from '../../state/clipboard'
import { useDoc } from '../../state/doc'
import { fromLibraryAssets, toLibraryAssets, useLibrary, type LibraryGroup, type LibraryItem } from '../../state/library'
import { imageSize, makeAsset } from '../../state/ops'
import { useUi } from '../../state/ui'
import { BUILTIN_LIBRARIES, type BuiltinItem } from '../../resources/builtins'
import { ContextMenu, cx, IconButton, type MenuItem } from '../primitives'

const svgUrlCache = new Map<string, string>()
function svgUrl(item: BuiltinItem): string {
  let u = svgUrlCache.get(item.id)
  if (!u) {
    u = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(item.svg)}`
    svgUrlCache.set(item.id, u)
  }
  return u
}

function insertBuiltin(item: BuiltinItem): void {
  const bytes = new TextEncoder().encode(item.svg)
  const asset = makeAsset(bytes, 'image/svg+xml', item.name)
  const scale = 1.4
  const obj: ImageObject = { id: newId('o'), type: 'image', x: 0, y: 0, w: item.w * scale, h: item.h * scale, assetId: asset.id, opacity: 1, name: item.name }
  insertObjectsCentered([obj], [asset], `Insert ${item.name}`)
}

function insertLibraryItem(item: LibraryItem): void {
  insertObjectsCentered(item.objects, fromLibraryAssets(item.assets), `Insert ${item.name}`)
}

function GroupBlock({ group, filter }: { group: LibraryGroup; filter: string }) {
  const lib = useLibrary()
  const [menu, setMenu] = useState<{ x: number; y: number; item?: LibraryItem } | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(group.name)
  const items = group.items.filter((i) => !filter || i.name.toLowerCase().includes(filter))
  const hasSelection = useDoc((s) => s.selection.length > 0)

  const addImages = async () => {
    const files = await api.pickFiles('library').catch(() => [])
    for (const f of files) {
      try {
        const size = await imageSize(f.bytes, f.mime)
        const scale = Math.min(1, 480 / Math.max(size.w, size.h))
        const asset = makeAsset(f.bytes, f.mime, f.name)
        const obj: ImageObject = { id: newId('o'), type: 'image', x: 0, y: 0, w: size.w * scale, h: size.h * scale, assetId: asset.id, opacity: 1, name: f.name }
        const preview = URL.createObjectURL(new Blob([f.bytes as BlobPart], { type: f.mime }))
        // Store a small data-URL preview so the library renders without decoding every item.
        const img = new Image()
        img.src = preview
        await img.decode()
        const c = document.createElement('canvas')
        const k = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight))
        c.width = Math.max(1, Math.round(img.naturalWidth * k))
        c.height = Math.max(1, Math.round(img.naturalHeight * k))
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
        URL.revokeObjectURL(preview)
        lib.addItem(group.id, { name: f.name.replace(/\.[^.]+$/, ''), preview: c.toDataURL('image/png'), objects: [obj], assets: toLibraryAssets([asset]) })
      } catch {
        useUi.getState().toast(`“${f.name}” could not be added.`, 'error')
      }
    }
  }

  const groupMenu: MenuItem[] = [
    { label: 'Add Selection to Group…', disabled: !hasSelection, onSelect: () => useUi.getState().openDialog({ kind: 'saveToLibrary' }) },
    { label: 'Add Images…', onSelect: addImages },
    { label: 'Rename Group', onSelect: () => setRenaming(true) },
    { separator: true, label: '' },
    {
      label: 'Delete Group…',
      danger: true,
      onSelect: () =>
        useUi.getState().openDialog({
          kind: 'confirm',
          title: `Delete “${group.name}”?`,
          message: `The group and its ${group.items.length} resource${group.items.length === 1 ? '' : 's'} will be permanently removed from your library. Lessons that already use them are not affected.`,
          confirmLabel: 'Delete Group',
          danger: true,
          onConfirm: () => lib.removeGroup(group.id)
        })
    }
  ]
  const itemMenu = (item: LibraryItem): MenuItem[] => [
    { label: 'Insert', onSelect: () => insertLibraryItem(item) },
    {
      label: 'Rename…',
      onSelect: () =>
        useUi.getState().openDialog({
          kind: 'prompt',
          title: 'Rename Resource',
          label: 'Name',
          value: item.name,
          submitLabel: 'Rename',
          onSubmit: (n) => lib.renameItem(group.id, item.id, n)
        })
    },
    { separator: true, label: '' },
    {
      label: 'Delete…',
      danger: true,
      onSelect: () =>
        useUi.getState().openDialog({
          kind: 'confirm',
          title: `Delete “${item.name}”?`,
          message: 'This resource will be permanently removed from your library.',
          confirmLabel: 'Delete',
          danger: true,
          onConfirm: () => lib.removeItem(group.id, item.id)
        })
    }
  ]

  return (
    <section className="lib-group">
      <header className="lib-group__head">
        {renaming ? (
          <input
            className="section-head__input"
            autoFocus
            value={name}
            aria-label="Group name"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              setRenaming(false)
              lib.renameGroup(group.id, name)
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <h3 onDoubleClick={() => setRenaming(true)}>{group.name}</h3>
        )}
        <IconButton label="Add images to this group" size="s" onClick={addImages}>
          <ImagePlus size={15} />
        </IconButton>
        <IconButton
          label="Group options"
          size="s"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setMenu({ x: r.left - 120, y: r.bottom + 4 })
          }}
        >
          <MoreHorizontal size={15} />
        </IconButton>
      </header>
      {items.length ? (
        <div className="lib-grid">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              className="lib-tile"
              onClick={() => insertLibraryItem(it)}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ x: e.clientX, y: e.clientY, item: it })
              }}
              data-tip={`${it.name} — click to insert`}
            >
              <img src={it.preview} alt="" draggable={false} />
              <span>{it.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="lib-empty">{filter ? 'No matches.' : 'Empty. Select objects on the page and choose “Save Selection to Library”, or add images.'}</p>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.item ? itemMenu(menu.item) : groupMenu} onClose={() => setMenu(null)} />}
    </section>
  )
}

export function ResourcesPanel() {
  const [tab, setTab] = useState<string>(BUILTIN_LIBRARIES[0].id)
  const [query, setQuery] = useState('')
  const lib = useLibrary()
  useEffect(() => {
    void lib.load()
  }, [lib])
  const filter = query.trim().toLowerCase()
  const builtin = BUILTIN_LIBRARIES.find((l) => l.id === tab)
  const shown = useMemo(() => builtin?.items.filter((i) => !filter || i.name.toLowerCase().includes(filter)) ?? [], [builtin, filter])

  return (
    <div className="res-panel">
      <label className="search">
        <Search size={15} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search resources" aria-label="Search resources" />
      </label>
      <div className="chip-row chip-row--tabs" role="tablist">
        {BUILTIN_LIBRARIES.map((l) => (
          <button key={l.id} type="button" role="tab" aria-selected={tab === l.id} className={cx('chip', tab === l.id && 'is-active')} onClick={() => setTab(l.id)}>
            {l.name}
          </button>
        ))}
        <button type="button" role="tab" aria-selected={tab === 'mine'} className={cx('chip', tab === 'mine' && 'is-active')} onClick={() => setTab('mine')}>
          My Library
        </button>
      </div>

      {builtin && (
        <div className="lib-grid">
          {shown.map((it) => (
            <button key={it.id} type="button" className="lib-tile" onClick={() => insertBuiltin(it)} data-tip={`${it.name} — click to insert`}>
              <img src={svgUrl(it)} alt="" draggable={false} />
              <span>{it.name}</span>
            </button>
          ))}
          {!shown.length && <p className="lib-empty">No matches.</p>}
        </div>
      )}

      {tab === 'mine' && (
        <div className="lib-mine">
          {lib.groups.map((g) => (
            <GroupBlock key={g.id} group={g} filter={filter} />
          ))}
          <div className="row">
            <button type="button" className="btn btn--secondary btn--small" onClick={() => lib.addGroup(`Group ${lib.groups.length + 1}`)}>
              <FolderPlus size={15} /> New group
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => useUi.getState().openDialog({ kind: 'saveToLibrary' })} disabled={!useDoc.getState().selection.length}>
              <Plus size={15} /> Save selection
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
