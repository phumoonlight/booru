import { useCallback, useMemo, useState } from 'react'
import { RATING_COLOR, RATING_LABEL } from '@common/search'
import type { Collection } from '../../../shared/api'
import { BUTTON, buttonToggle } from './buttons'
import { FIELD } from './panel'
import { Modal } from './modal'
import { CollectionForm, shelfTitle } from './collection-form'
import { fullImageUrl } from './collection-thumbs'
import { useDrawnBox } from './drawn-box'

/** Cards drawn at first, and what Load more adds. */
const PAGE = 20

/**
 * Every shelf, as cards. The cover is the newest image on it, decided by the query.
 *
 * **The search is over the list already here, not a read.** The website's is a GET form
 * because a search there is a URL somebody shares; this one is a box narrowing a list the
 * window is holding in full — it has to be, since an image's panel offers moving it to any
 * other shelf. Run on Enter against the whole list, it answers at once and never leaves the
 * board wondering what happened to the read it was halfway through.
 */
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
  const closeNaming = useCallback(() => setNaming(false), [])
  // What is typed, and what the list is narrowed by — apart, because a search runs on Enter
  // or 🔍 Search rather than per keystroke: every narrowing re-cuts a screenful of covers, and
  // a half-typed name flickering the grid through every prefix of itself is noise.
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  // How many cards are drawn. The list is held whole (see above), so this pages the drawing,
  // not the read: each card is a full-size image to cut, and forty of them on open is a lot
  // of work for the few at the top somebody is looking for. A new search starts over.
  const [limit, setLimit] = useState(PAGE)
  const search = (value: string) => {
    setDraft(value)
    setQuery(value)
    setLimit(PAGE)
  }

  // The mark and the id are searched with the name, because both are how a shelf gets
  // referred to — `#5` is what the heading above it says, and 🎴 is part of what it is
  // called. Case-insensitive, and anywhere in the name, as the website's is.
  const needle = query.trim().toLowerCase()
  const shown = useMemo(
    () =>
      needle === ''
        ? collections
        : collections.filter(
            (collection) =>
              shelfTitle(collection).toLowerCase().includes(needle) ||
              `#${collection.id}` === needle
          ),
    [collections, needle]
  )

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4 px-4 pt-4 pb-25">
      {/* Three columns, the outer two equal, so the search sits at the true centre of the
          row whatever the title and the buttons measure. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-bold tracking-tight">🗂️ Collections</h1>
          <span className="text-xs text-muted">
            {loading
              ? 'reading…'
              : needle === ''
                ? `${collections.length} collection${collections.length === 1 ? '' : 's'}`
                : `${shown.length} of ${collections.length}`}
          </span>
        </div>
        {/* A form, so Enter is the submit. The ✕ sits inside the box rather than beside it,
            so the box does not slide off centre the moment something is typed. */}
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            search(draft)
          }}
          className="flex items-center gap-1"
        >
          <div className="relative">
            {/* A description rather than the usual example: in a box this short, sitting
                among buttons, "Ukiyo-e" read as a search already typed in. */}
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label="Search collections"
              placeholder="Search collections…"
              spellCheck={false}
              className={`${FIELD} w-48 pr-8 sm:w-72`}
            />
            {(draft !== '' || query !== '') && (
              <button
                type="button"
                onClick={() => search('')}
                title="Clear the search"
                aria-label="Clear the search"
                className="absolute inset-y-0 right-0 px-2 text-xs text-muted hover:text-foreground"
              >
                <span aria-hidden>✕</span>
              </button>
            )}
          </div>
          <button type="submit" className={BUTTON}>
            <span aria-hidden>🔍</span> Search
          </button>
        </form>
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => setNaming((was) => !was)}
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
        <Modal title="New collection" onClose={closeNaming}>
          {/* A name, a mark, a rating and the AI flag. There is no cover to choose — it is
              the newest image on the shelf — and nothing to file the shelf under. */}
          <CollectionForm
            initial={{ name: '', mark: '', rating: 'g', is_ai: false }}
            submitLabel="Create"
            onSubmit={async (input) => {
              const result = await window.api.createCollection(input)
              if (!result.ok) return result.error
              setNaming(false)
              onCreated(result.id)
              return null
            }}
          />
        </Modal>
      )}

      {shown.length === 0 ? (
        <p className="border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {loading
            ? 'Loading…'
            : needle !== ''
              ? `Nothing here is called “${query.trim()}”.`
              : 'No collections yet. ➕ New collection names one.'}
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-[repeat(auto-fill,322px)] justify-center gap-0.5">
            {shown.slice(0, limit).map((collection) => (
              <li key={collection.id}>
                <ShelfCard collection={collection} onOpen={() => onOpen(collection.id)} />
              </li>
            ))}
          </ul>
          {shown.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((was) => was + PAGE)}
              className={`${BUTTON} mx-auto`}
            >
              <span aria-hidden>⬇️</span> Load {Math.min(PAGE, shown.length - limit)} more
            </button>
          )}
        </>
      )}
    </div>
  )
}

function ShelfCard({ collection, onOpen }: { collection: Collection; onOpen: () => void }) {
  const { cover_file_name: cover, cover_file_ext: coverExt } = collection
  const images = `${collection.post_count} image${collection.post_count === 1 ? '' : 's'}`
  const [box, drawn] = useDrawnBox<HTMLDivElement>()
  // Cut from the top (`-top`, `main/grid-image.ts`): most covers are portraits, and a
  // square from the middle of one is a torso where the top is a face.
  const src = cover && coverExt && drawn ? fullImageUrl(cover, coverExt, `${drawn}-top`) : ''

  return (
    <button
      type="button"
      onClick={onOpen}
      title={`Open ${shelfTitle(collection)}`}
      className="group flex w-full flex-col overflow-hidden border border-border bg-surface text-left transition-colors hover:border-hover"
    >
      {/* Square, and the one place in this app a picture is cropped square. The picture here
          is a label on a box rather than the thing being looked at, and even tiles are what
          make the names read as one column you can run your eye down. */}
      <div
        ref={box}
        className="grid aspect-square place-items-center overflow-hidden bg-background"
      >
        {src ? (
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover object-top"
          />
        ) : cover ? null : (
          <span aria-hidden className="text-2xl opacity-40">
            🗂️
          </span>
        )}
      </div>
      <span className="flex flex-col gap-0.5 px-1.5 py-1">
        <span className="line-clamp-2 text-xs font-semibold">{shelfTitle(collection)}</span>
        <span className="flex items-center justify-between gap-1 text-[11px]">
          <span className="text-muted">
            #{collection.id} · {images}
            {collection.is_ai && (
              <span aria-label="AI" title="Generated images">
                {' '}
                🤖
              </span>
            )}
          </span>
          <span className={RATING_COLOR[collection.rating]}>
            {RATING_LABEL[collection.rating]}
          </span>
        </span>
      </span>
    </button>
  )
}
