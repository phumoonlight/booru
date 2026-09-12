import { useEffect, useState } from 'react'
import type { Collection } from '../../../shared/api'
import { BUTTON, BUTTON_SUBMIT_ON_SURFACE, buttonToggle } from './buttons'
import { FIELD, Panel } from './panel'
import { thumbnailFor, thumbnails } from './collection-thumbs'

/** Every shelf, as cards. The cover is the newest image on it, decided by the query. */
export function ShelfList({
  collections,
  loading,
  onRefresh,
  onOpen,
  onCreated,
}: {
  collections: Collection[]
  loading: boolean
  onRefresh: () => void
  onOpen: (id: number) => void
  onCreated: (id: number) => void
}) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function create() {
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await window.api.createCollection(name)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setName('')
    setNaming(false)
    onCreated(result.id)
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-4 pb-25">
      <div className="flex items-baseline gap-2">
        <h1 className="text-lg font-bold tracking-tight">🗂️ Collections</h1>
        <span className="text-xs text-muted">
          {loading
            ? 'reading…'
            : `${collections.length} collection${collections.length === 1 ? '' : 's'}`}
        </span>
        <div className="ml-auto flex items-center">
          <button
            type="button"
            onClick={() => {
              setNaming((was) => !was)
              setError(null)
            }}
            aria-pressed={naming}
            className={buttonToggle(naming)}
          >
            <span aria-hidden>➕</span> New collection
          </button>
          <button type="button" onClick={onRefresh} disabled={loading} className={BUTTON}>
            <span aria-hidden className={`transition-opacity ${loading ? 'opacity-30' : ''}`}>
              🔄
            </span>
            Refresh
          </button>
        </div>
      </div>

      {naming && (
        <Panel title="New collection">
          {/* A name and nothing else. There is no cover to choose — it is the newest image
              on the shelf — and nothing to file the shelf under. */}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
            className="flex items-center gap-2"
          >
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ukiyo-e studies"
              className={`${FIELD} flex-1`}
            />
            <button type="submit" disabled={busy} className={BUTTON_SUBMIT_ON_SURFACE}>
              <span aria-hidden>✅</span> Create
            </button>
          </form>
          {error && <p className="text-xs text-[#ff5d5f]">{error}</p>}
        </Panel>
      )}

      {collections.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {loading ? 'Loading…' : 'No collections yet. ➕ New collection names one.'}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {collections.map((collection) => (
            <li key={collection.id}>
              <ShelfCard collection={collection} onOpen={() => onOpen(collection.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ShelfCard({ collection, onOpen }: { collection: Collection; onOpen: () => void }) {
  const cover = collection.cover_file_name
  const [src, setSrc] = useState(cover ? (thumbnails.get(cover) ?? '') : '')

  useEffect(() => {
    if (!cover || thumbnails.has(cover)) return
    let alive = true
    void thumbnailFor(cover).then((url) => {
      if (alive) setSrc(url)
    })
    return () => {
      alive = false
    }
  }, [cover])

  return (
    <button
      type="button"
      onClick={onOpen}
      title={`Open ${collection.name}`}
      className="group flex w-full flex-col overflow-hidden rounded-lg border border-border bg-surface text-left transition-colors hover:border-accent"
    >
      {/* Square, and the one place in this app a thumbnail is cropped. The picture here is
          a label on a box rather than the thing being looked at, and even tiles are what
          make the names read as one column you can run your eye down. */}
      <div className="grid aspect-square place-items-center overflow-hidden bg-background">
        {src ? (
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden className="text-2xl opacity-40">
            🗂️
          </span>
        )}
      </div>
      <span className="flex flex-col gap-0.5 px-1.5 py-1">
        <span className="line-clamp-2 text-xs font-semibold">{collection.name}</span>
        <span className="text-[11px] text-muted">
          {collection.post_count} image{collection.post_count === 1 ? '' : 's'}
        </span>
      </span>
    </button>
  )
}
