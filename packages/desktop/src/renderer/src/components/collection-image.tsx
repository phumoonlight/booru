import { useEffect, useState } from 'react'
import { collectionPostHref } from '@common/collections'
import type { CollectionPost } from '../../../shared/api'
import { BUTTON_ON_SURFACE, BUTTON_SUBMIT_ON_SURFACE, DANGER_ON_SURFACE } from './buttons'
import { HoldButton } from './hold-button'
import { ImageViewer } from './image-viewer'
import { FIELD, Panel } from './panel'
import { thumbnailFor, thumbnails } from './collection-thumbs'
import { ratioOf } from './ratio-layout'

/** Module-level, so the viewer's effect has a dependency that does not change between
 *  renders — `window.api` is a bridge proxy and need not hand back the same function twice. */
const loadCollectionImage = (id: number): Promise<string> => window.api.collectionImage(id)

/** One tile. It asks for its own image: a shelf can be a few hundred rows after enough
 *  scrolling, and fetching them all up front would stall the first screenful behind the
 *  last. */
export function ImageCard({
  post,
  selected,
  onOpen,
}: {
  post: CollectionPost
  /** Set only in manage, where a click selects rather than opens. */
  selected?: boolean
  onOpen: () => void
}) {
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
      aria-pressed={selected}
      className={`group relative flex w-full flex-col overflow-hidden rounded-lg border bg-surface text-left transition-colors ${
        selected ? 'border-accent ring-2 ring-accent' : 'border-border hover:border-accent'
      }`}
    >
      {selected !== undefined && (
        <span
          aria-hidden
          className={`absolute left-1.5 top-1.5 z-10 grid size-5 place-items-center rounded-full border text-xs ${
            selected
              ? 'border-accent bg-accent text-background'
              : 'border-foreground/60 bg-background/60 text-transparent'
          }`}
        >
          ✓
        </span>
      )}
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
 * One image's panel: its source, the way to look at it properly, and the way to remove it.
 * Not its rating, which is its shelf's, and not its shelf, which is changed for a selection
 * in 🗂️ Manage.
 *
 * **The source is read until it is asked to be edited.** It used to be a live box written on
 * blur, which made the one field here something you could change by clicking into it and
 * tabbing away — and a URL is long enough that its middle is exactly where a stray paste
 * lands. Read, it is drawn as what it is: a link, which goes where the image came from.
 * ✏️ Edit turns it into the box, ✅ Save writes it, and ✕ Cancel puts back what the board
 * still holds.
 *
 * Pinned to the top of the scroller, since the grid it was opened from can be a long way
 * down.
 */
export function ImagePanel({
  post,
  siteUrl,
  onClose,
  onChanged,
  onDeleted,
}: {
  post: CollectionPost
  siteUrl: string
  onClose: () => void
  onChanged: () => void
  onDeleted: () => void
}) {
  const stored = post.source_url ?? ''
  const [source, setSource] = useState(stored)
  const [editing, setEditing] = useState(false)
  const [viewing, setViewing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    // Opening the box and closing it again without changing anything is not an edit.
    if (source === stored) {
      setEditing(false)
      return
    }
    const result = await window.api.saveCollectionPost({ id: post.id, sourceUrl: source })
    if (!result.ok) {
      setError(result.error)
      // Back to what the board still holds, which is what the row said when it was read.
      setSource(stored)
      return
    }
    setError(null)
    setEditing(false)
    onChanged()
  }

  return (
    <>
      <Panel
        title={`Image #${post.id}`}
        pinned
        actions={
          <>
            {/* Drawn only while the source is being read: what it opens carries its own
                ✅ Save and ✕ Cancel, and a third way out of one field is one too many. */}
            {!editing && (
              <button type="button" onClick={() => setEditing(true)} className={BUTTON_ON_SURFACE}>
                <span aria-hidden>✏️</span> Edit
              </button>
            )}
            <button
              type="button"
              onClick={() => setViewing(true)}
              title="Look at the stored image at its full size"
              className={BUTTON_ON_SURFACE}
            >
              <span aria-hidden>🔍</span> Full size
            </button>
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
            {/* Held for two seconds, because this is the one control here that cannot be taken
                back — the row goes and both stored objects go with it. It was two presses,
                and a second press lands as easily as the first. */}
            <HoldButton
              ms={2000}
              fill="bg-[#ff5d5f]/30"
              title="Hold for two seconds to delete"
              onHold={() => {
                void window.api.deleteCollectionPost(post.id).then((result) => {
                  if (result.ok) onDeleted()
                  else setError(result.error)
                })
              }}
              className={DANGER_ON_SURFACE}
            >
              <span aria-hidden>🗑️</span> Hold to delete
            </HoldButton>
            <button type="button" onClick={onClose} className={BUTTON_ON_SURFACE}>
              <span aria-hidden>✕</span> Close
            </button>
          </>
        }
      >
        {editing ? (
          // A form, so the return key finishes the edit: this is one field, and reaching for
          // Save with the mouse after pasting a URL is a trip for nothing.
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted">
              Source
              <input
                autoFocus
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="https://www.pixiv.net/en/artworks/91502032"
                spellCheck={false}
                className={`${FIELD} min-w-0 flex-1`}
              />
            </label>
            <button type="submit" className={BUTTON_SUBMIT_ON_SURFACE}>
              <span aria-hidden>✅</span> Save
            </button>
            <button
              type="button"
              onClick={() => {
                setSource(stored)
                setEditing(false)
                setError(null)
              }}
              className={BUTTON_ON_SURFACE}
            >
              <span aria-hidden>✕</span> Cancel
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            Source
            {stored ? (
              // Text that genuinely is a link — it goes somewhere, which is the one case in
              // this window that keeps the underline.
              <button
                type="button"
                onClick={() => void window.api.openExternal(stored)}
                title="Open the source in your browser"
                className="min-w-0 flex-1 truncate text-left text-accent hover:underline"
              >
                {stored}
              </button>
            ) : (
              <span className="flex-1">No source</span>
            )}
          </div>
        )}
        {error && <p className="text-xs text-[#ff5d5f]">{error}</p>}
      </Panel>

      {viewing && (
        <ImageViewer
          id={post.id}
          width={post.width}
          height={post.height}
          fallback={thumbnails.get(post.file_name) ?? ''}
          label={`Image ${post.id}`}
          load={loadCollectionImage}
          onClose={() => setViewing(false)}
        />
      )}
    </>
  )
}
