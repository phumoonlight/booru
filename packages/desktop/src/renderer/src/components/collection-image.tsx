import { useEffect, useState } from 'react'
import { collectionPostHref } from '@common/collections'
import type { Collection, CollectionPost } from '../../../shared/api'
import { BUTTON_ON_SURFACE } from './buttons'
import { FIELD, Panel } from './panel'
import { thumbnailFor, thumbnails } from './collection-thumbs'
import { ratioOf } from './ratio-layout'
import { shelfTitle } from './collection-form'

/** One tile. It asks for its own image: a shelf can be a few hundred rows after enough
 *  scrolling, and fetching them all up front would stall the first screenful behind the
 *  last. */
export function ImageCard({ post, onOpen }: { post: CollectionPost; onOpen: () => void }) {
  const [src, setSrc] = useState(thumbnails.get(post.file_name) ?? '')

  useEffect(() => {
    if (thumbnails.has(post.file_name)) return
    let alive = true
    void thumbnailFor(post.file_name).then((url) => {
      if (alive) setSrc(url)
    })
    return () => {
      alive = false
    }
  }, [post.file_name])

  return (
    <button
      type="button"
      onClick={onOpen}
      title={`Image ${post.id}`}
      className="group flex w-full flex-col overflow-hidden rounded-lg border border-border bg-surface text-left transition-colors hover:border-accent"
    >
      <div
        className="grid place-items-center overflow-hidden bg-background"
        style={{ aspectRatio: ratioOf(post.width, post.height) }}
      >
        {src ? (
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted">…</span>
        )}
      </div>
      <span className="px-1.5 py-1 text-[11px] text-muted">#{post.id}</span>
    </button>
  )
}

/**
 * One image's panel: its shelf, its source, and the way to remove it. Not its rating,
 * which is its shelf's.
 *
 * It writes on use and puts the old value back if the write fails — a Save button over one
 * field is a thing to forget to press. Pinned to the top of the scroller, since the grid it
 * was opened from can be a long way down.
 */
export function ImagePanel({
  post,
  collections,
  siteUrl,
  onClose,
  onChanged,
  onDeleted,
  onMoved,
}: {
  post: CollectionPost
  collections: Collection[]
  siteUrl: string
  onClose: () => void
  onChanged: () => void
  onDeleted: () => void
  onMoved: () => void
}) {
  const [source, setSource] = useState(post.source_url ?? '')
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  async function write(sourceUrl: string) {
    // Leaving the box without changing it is not an edit.
    if (sourceUrl === (post.source_url ?? '')) return
    const result = await window.api.saveCollectionPost({ id: post.id, sourceUrl })
    if (!result.ok) {
      setError(result.error)
      // Back to what the board still holds, which is what the row said when it was read.
      setSource(post.source_url ?? '')
      return
    }
    setError(null)
    onChanged()
  }

  return (
    <Panel
      title={`Image #${post.id}`}
      pinned
      actions={
        <>
          {siteUrl && (
            <button
              type="button"
              onClick={() =>
                void window.api.openExternal(
                  `${siteUrl}${collectionPostHref(post.collection_id, post.id)}`
                )
              }
              className={BUTTON_ON_SURFACE}
            >
              <span aria-hidden>🌐</span> Open
            </button>
          )}
          {/* Two presses, because this is the one control here that cannot be taken back —
              the row goes and both stored objects go with it. */}
          <button
            type="button"
            onClick={() => {
              if (!confirming) {
                setConfirming(true)
                return
              }
              void window.api.deleteCollectionPost(post.id).then((result) => {
                if (result.ok) onDeleted()
                else setError(result.error)
              })
            }}
            className={BUTTON_ON_SURFACE}
          >
            <span aria-hidden>🗑️</span> {confirming ? 'Really delete' : 'Delete'}
          </button>
          <button type="button" onClick={onClose} className={BUTTON_ON_SURFACE}>
            <span aria-hidden>✕</span> Close
          </button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        {/* Which shelf it is on, as a menu of every shelf. A menu rather than a drag onto a
            card: the destination is very often a collection that is not on screen, and this
            panel is already the one place an image is answered questions about. Moving
            costs no bytes — a collection's images are under one flat prefix, so the shelf is
            one column of one row (`moveCollectionPost`). */}
        <label className="flex items-center gap-2 text-xs text-muted">
          Collection
          <select
            value={post.collection_id}
            onChange={(event) => {
              const next = Number(event.target.value)
              if (next === post.collection_id) return
              void window.api.moveCollectionPost(post.id, next).then((result) => {
                if (result.ok) onMoved()
                else setError(result.error)
              })
            }}
            className={FIELD}
          >
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {shelfTitle(collection)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted">
          Source
          <input
            value={source}
            onChange={(event) => setSource(event.target.value)}
            // Written when the box is left rather than on every keystroke: a URL is typed
            // or pasted whole, and a write per character would be a write per character.
            onBlur={() => void write(source)}
            placeholder="https://"
            className={`${FIELD} min-w-0 flex-1`}
          />
        </label>
      </div>
      {error && <p className="text-xs text-[#ff5d5f]">{error}</p>}
    </Panel>
  )
}
