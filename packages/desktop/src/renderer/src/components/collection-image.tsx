import { useEffect, useState } from 'react'
import { collectionPostHref } from '@common/collections'
import type { CollectionPost, CollectionTag } from '../../../shared/api'
import { BUTTON_ON_SURFACE, BUTTON_SUBMIT_ON_SURFACE, DANGER_ON_SURFACE } from './buttons'
import { HoldButton } from './hold-button'
import { ImageViewer } from './image-viewer'
import { FIELD, Panel } from './panel'
import { fullImageUrl } from './collection-thumbs'
import { ImageTags } from './collection-image-tags'
import { useDrawnBox } from './drawn-box'
import { Facts, Preview } from './collection-image-details'

/** One tile. It asks for its own image, cut to its own box (`useDrawnBox`) and loaded
 *  lazily: a shelf can be a few hundred rows after enough scrolling, and fetching them all up
 *  front would stall the first screenful behind the last. */
export function ImageCard({
  post,
  selected,
  current = false,
  onOpen,
  onView,
}: {
  post: CollectionPost
  /** Set only in manage, where a click selects rather than opens. */
  selected?: boolean
  /** The image the panel at the foot of the window is about — far from it once pinned, so
   *  the tile says which one it is. An outline inside the edge, since the gap is 2px. */
  current?: boolean
  onOpen: () => void
  /** A double click: straight to the full-size viewer. The first click of it has already
   *  opened the panel, so the viewer lands with the panel behind it, as 🔍 Full size would. */
  onView?: () => void
}) {
  const [box, drawn] = useDrawnBox<HTMLDivElement>()

  return (
    <button
      type="button"
      onClick={onOpen}
      onDoubleClick={onView}
      title={`Image ${post.id}`}
      aria-pressed={selected}
      // The desktop's hover green (`--hover`) rather than accent, so a lit tile stands out
      // from the accent-coloured controls around the grid.
      className={`group relative flex w-full flex-col overflow-hidden border bg-surface text-left transition-colors ${
        selected
          ? 'border-hover ring-2 ring-hover'
          : current
            ? 'border-hover outline-3 -outline-offset-3 outline-hover'
            : 'border-border hover:border-hover'
      }`}
      aria-current={current || undefined}
    >
      {selected !== undefined && (
        <span
          aria-hidden
          className={`absolute left-1.5 top-1.5 z-10 grid size-5 place-items-center rounded-full border text-xs ${
            selected
              ? 'border-hover bg-hover text-background'
              : 'border-foreground/60 bg-background/60 text-transparent'
          }`}
        >
          ✓
        </span>
      )}
      {/* `--row-h` itself, not an aspect ratio: the ratio ran against the width inside the
          tile's 1px border, so each tile came out short by 2px ÷ its own ratio and no two
          rows lined up. */}
      <div
        ref={box}
        className="grid h-(--row-h) place-items-center overflow-hidden bg-background"
      >
        {drawn && (
          <img
            src={fullImageUrl(post.file_name, post.file_ext, drawn)}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        )}
      </div>
    </button>
  )
}

/**
 * One image's panel: its source, its tags, the way to look at it properly, and the way to
 * remove it. Not its rating, which is its shelf's, and not its shelf, which is changed for a
 * selection in 🗂️ Manage.
 *
 * **The source is read until it is asked to be edited.** It used to be a live box written on
 * blur, which made the one field here something you could change by clicking into it and
 * tabbing away — and a URL is long enough that its middle is exactly where a stray paste
 * lands. Read, it is drawn as what it is: a link, which goes where the image came from.
 * ✏️ Edit turns it into the box, ✅ Save writes it, and ✕ Cancel puts back what the board
 * still holds.
 *
 * Pinned to the foot of the scroller, since the grid it was opened from can be a long way
 * up or down, and the tile it is about is outlined so it can be found again.
 */
export function ImagePanel({
  post,
  tags,
  siteUrl,
  onClose,
  onChanged,
  onTagged,
  onDeleted,
  viewing,
  onViewing,
  onStep,
}: {
  post: CollectionPost
  /** The shelf's tags, every one of which the panel offers. */
  tags: CollectionTag[]
  siteUrl: string
  /** Whether the full-size viewer is open — the shelf's, not this panel's, because ← / →
   *  swap the image and with it this keyed panel, and the viewer must survive the swap. */
  viewing: boolean
  onViewing: (open: boolean) => void
  /** ← / → in the viewer: the neighbouring image in the grid. */
  onStep: (delta: -1 | 1) => void
  onClose: () => void
  onChanged: () => void
  /** A tag went on or came off — the counts on the bar above are now wrong. */
  onTagged: () => void
  onDeleted: () => void
}) {
  const stored = post.source_url ?? ''
  const [source, setSource] = useState(stored)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Null until read, so the pills are not drawn unlit for a moment and then light up — which
  // would look like the image losing its tags and getting them back.
  const [carried, setCarried] = useState<number[] | null>(null)

  useEffect(() => {
    let alive = true
    void window.api.listCollectionPostTags(post.id).then((rows) => {
      if (alive) setCarried(rows.map((row) => row.id))
    })
    return () => {
      alive = false
    }
  }, [post.id])

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
        pinned="bottom"
        actions={
          <>
            {/* Disabled, not removed, while the source is being edited: what it opened carries
                its own ✅ Save and ✕ Cancel, and a button that vanished took the group's
                left end with it, sliding the rest along under the pointer. */}
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={editing}
              className={BUTTON_ON_SURFACE}
            >
              <span aria-hidden>✏️</span> Edit
            </button>
            <button
              type="button"
              onClick={() => onViewing(true)}
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
          </>
        }
        close={
          <button type="button" onClick={onClose} className={BUTTON_ON_SURFACE}>
            <span aria-hidden>✕</span> Close
          </button>
        }
      >
        <div className="flex gap-3">
          <Preview post={post} onView={() => onViewing(true)} />
          {/* One grid for the whole body: labels in a narrow column, values beside them, so
              Source and Tags start on one edge and wrapped pills stay under their own row
              rather than under the word. A form throughout, so Enter in the source box saves;
              while reading there is nothing in it to submit. */}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
            className="grid min-w-0 flex-1 grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 text-xs text-muted"
          >
            <label htmlFor={`source-${post.id}`} className={editing ? 'pt-2.5' : ''}>
              Source
            </label>
            {editing ? (
              // A box that grows to show the whole address (`field-sizing: content`) rather
              // than a one-line input scrolling its tail out of sight — the end of a URL is the
              // part that differs between one image and the next. A URL has no line breaks, so
              // Enter still saves instead of starting a new line.
              <textarea
                id={`source-${post.id}`}
                autoFocus
                rows={1}
                value={source}
                onChange={(event) => setSource(event.target.value.replace(/\s*\n\s*/g, ''))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
                placeholder="https://www.pixiv.net/en/artworks/91502032"
                spellCheck={false}
                className={`${FIELD} min-w-0 resize-none py-2 break-all text-foreground field-sizing-content`}
              />
            ) : stored ? (
              // Text that genuinely is a link — it goes somewhere, which is the one case in this
              // window that keeps the underline. As wide as its text and no wider, so the empty
              // rest of the line is not a click to the browser; wrapped whole rather than cut,
              // since the tail of a URL is the part worth reading.
              <button
                type="button"
                onClick={() => void window.api.openExternal(stored)}
                title="Open the source in your browser"
                className="min-w-0 justify-self-start break-all text-left text-accent hover:underline"
              >
                {stored}
              </button>
            ) : (
              <span>No source</span>
            )}

            {/* Level with the middle of the first row of pills. */}
            <span className="pt-2">Tags</span>
            {carried ? (
              <ImageTags
                postId={post.id}
                tags={tags}
                carried={carried}
                editing={editing}
                onChanged={(next) => {
                  setCarried(next)
                  onTagged()
                }}
              />
            ) : (
              <span className="pt-2">…</span>
            )}

            {/* Set off from the tags: those are about what the image shows, this about the
                file, and run together the last row of pills read as part of it. */}
            <div className="col-span-2 mt-2">
              <Facts post={post} />
            </div>
            {error && <p className="col-span-2 text-[#ff5d5f]">{error}</p>}

            {/* At the foot, under everything the edit opened, rather than wedged between the
                source and the tags it does not apply to — a tag is written as it is pressed. */}
            {editing && (
              <div className="col-span-2 flex justify-end gap-2 border-t border-border pt-3">
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
                <button type="submit" className={BUTTON_SUBMIT_ON_SURFACE}>
                  <span aria-hidden>✅</span> Save
                </button>
              </div>
            )}
          </form>
          {/* Held for two seconds, because this is the one control here that cannot be taken
              back — the row goes and both stored objects go with it. It was two presses, and a
              second press lands as easily as the first. In the bottom corner, away from the
              row of things that are safe to press. */}
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
            // Held off from the field and Save beside it: the safe end of a form and the one
            // control here that cannot be undone should not be a slip of the pointer apart.
            className={`${DANGER_ON_SURFACE} ml-12 self-end`}
          >
            <span aria-hidden>🗑️</span> Hold to delete
          </HoldButton>
        </div>
      </Panel>

      {viewing && (
        <ImageViewer
          src={fullImageUrl(post.file_name, post.file_ext)}
          label={`Image ${post.id}`}
          onClose={() => onViewing(false)}
          onStep={onStep}
        />
      )}
    </>
  )
}
