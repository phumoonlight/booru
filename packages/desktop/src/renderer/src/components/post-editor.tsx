import { useEffect, useRef, useState } from 'react'
import { RATING_COLOR, RATING_LABEL, RATINGS, type Rating } from '@common/search'
import type { Post } from '@common/data/posts'
import { CategoryTagField } from './category-tag-field'
import type { TagSeed } from './tag-field'
import { invalidateTags } from './tag-index'

/**
 * One post, as a screen: the picture, then everything about it.
 *
 * It is laid out like a queue card on purpose — the image across the top, the fields
 * under it — because the two screens are the same job at different times, and the picture
 * is what every decision on them is made from. The old layout put it in a 192px column
 * beside a form, which is not enough of an image to decide a rating by.
 *
 * **There is no Save button.** Every control writes when it is used: a tag added or
 * removed, a rating chosen, a source committed. The form used to be a draft you could
 * lose by walking away from it, and a draft is the wrong shape for a post that already
 * exists — nothing here is being composed, each control is an edit to a row on the board.
 * A write that fails puts the old value back and says why, which is the only reason the
 * previous one is kept at all.
 *
 * Tags are `CategoryTagField`, the same editor the upload queue uses — staging a post and
 * editing one differ in when the write happens, not in what a tag is. Recommendations are
 * on here and implications are not: a recommended tag is a chip you press, which commits
 * like every other control, while an implied one is only ever appended at upload, and a
 * line of tags that were *not* being written would be the one lie on the screen.
 */
export function PostEditor({
  postId,
  siteUrl,
  onSaved,
  onDeleted,
  onClose,
}: {
  postId: number
  siteUrl: string
  /** A write landed: the grid behind this screen is now holding a stale row. */
  onSaved: () => void
  onDeleted: () => void
  onClose: () => void
}) {
  const [post, setPost] = useState<Post | null>(null)
  const [thumb, setThumb] = useState('')
  const [missing, setMissing] = useState(false)

  // The three editable things as one value, so a write is always the whole row and never
  // a merge of whatever three pieces of state happened to hold when it was sent.
  const [value, setValue] = useState<{ tags: TagSeed[]; rating: Rating; sourceUrl: string }>({
    tags: [],
    rating: 'g',
    sourceUrl: '',
  })
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  // Which write is the current one. Clicks come faster than round trips, and an earlier
  // failure must not roll back a later success — only the newest write may touch state.
  const writeId = useRef(0)

  useEffect(() => {
    let alive = true
    void window.api.getPost(postId).then((loaded) => {
      if (!alive) return
      if (!loaded) {
        setMissing(true)
        return
      }
      setPost(loaded.post)
      setValue({
        tags: loaded.tags.map(({ name, category }) => ({ name, category })),
        rating: loaded.post.rating,
        sourceUrl: loaded.post.source_url ?? '',
      })
      void window.api.postThumbnail(loaded.post.file_name).then((url) => {
        if (alive) setThumb(url)
      })
    })
    return () => {
      alive = false
    }
  }, [postId])

  async function commit(next: typeof value) {
    const previous = value
    const id = ++writeId.current
    setValue(next)
    setStatus('saving')
    setError('')

    const result = await window.api.savePost({
      id: postId,
      tags: next.tags.map((tag) => tag.name).join(' '),
      rating: next.rating,
      sourceUrl: next.sourceUrl,
    })
    if (id !== writeId.current) return

    if (!result.ok) {
      // The board never took it, so the screen must not go on claiming otherwise
      setValue(previous)
      setStatus('idle')
      setError(result.error)
      return
    }
    // The edit may have moved a tag's post_count or coined one; the Tags screen's copy of
    // the index is now wrong about it.
    invalidateTags()
    setStatus('saved')
    onSaved()
  }

  async function remove() {
    setBusy(true)
    setError('')
    const result = await window.api.deletePost(postId)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    invalidateTags()
    onDeleted()
  }

  if (missing) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          Post {postId} is not on the board any more.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mx-auto mt-4 block min-h-9 rounded-lg border border-border px-4 text-sm hover:bg-surface"
        >
          Back
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-bold tracking-tight">Post #{postId}</h1>
          {/* Everything here writes as it is used, so this line is the whole feedback the
              screen gives: what happened to the last edit, and nothing else. */}
          <span className="text-xs text-muted">
            {status === 'saving' ? 'saving…' : status === 'saved' ? 'saved' : ''}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {siteUrl && (
            <button
              type="button"
              onClick={() => void window.api.openExternal(`${siteUrl}/posts/${postId}`)}
              className="text-xs text-muted transition-colors hover:text-foreground"
            >
              🖼️ Open on the board
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted transition-colors hover:text-foreground"
          >
            ← Back
          </button>
        </div>
      </div>

      {post === null ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          Loading…
        </p>
      ) : (
        <>
          {/* 384px, which is exactly THUMB_MAX_HEIGHT — the thumbnail is all that crosses
              the bridge, so a taller band is upscaling and empty background either side
              of it. The queue card's is twice this because a staged file has its full
              preview to show and a rating still to be chosen from it. */}
          <div className="h-96 w-full overflow-hidden rounded-lg bg-background">
            {thumb ? (
              <img src={thumb} alt={`Post ${postId}`} className="h-full w-full object-contain" />
            ) : (
              <div className="grid h-full place-items-center text-xs text-muted">…</div>
            )}
          </div>
          <p className="-mt-2 text-center text-xs text-muted">
            {post.width}×{post.height} · {post.file_ext} · {formatBytes(post.file_size)}
          </p>

          {error && (
            <p className="rounded-lg border border-[#ff5d5f] px-3 py-2 text-sm text-[#ff5d5f]">
              {error}
            </p>
          )}

          <CategoryTagField
            value={value.tags}
            onChange={(tags) => void commit({ ...value, tags })}
            recommend
          />

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Rating</span>
            {/* Coloured closed and open: the scale is the one thing on this screen read at
                a glance rather than word by word, and these are the four colours the grid
                and the board already use for it. */}
            <select
              value={value.rating}
              onChange={(event) => void commit({ ...value, rating: event.target.value as Rating })}
              className={`min-h-9 w-56 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-accent ${RATING_COLOR[value.rating]}`}
            >
              {RATINGS.map((tier) => (
                <option key={tier} value={tier} className={`bg-surface ${RATING_COLOR[tier]}`}>
                  {RATING_LABEL[tier]}
                </option>
              ))}
            </select>
          </label>

          <SourceField
            value={value.sourceUrl}
            onCommit={(sourceUrl) => void commit({ ...value, sourceUrl })}
          />

          <DeletePanel
            postId={postId}
            busy={busy}
            confirming={confirming}
            onAsk={() => setConfirming(true)}
            onCancel={() => setConfirming(false)}
            onConfirm={() => void remove()}
          />
        </>
      )}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * The source, read until it is clicked. It is a URL looked at far more often than it is
 * changed, and a box is the wrong resting state for a value like that: an input invites a
 * cursor, and this one is an address you mostly want to read — or follow, which is the
 * Open beside the label.
 */
function SourceField({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  function done() {
    setEditing(false)
    if (draft.trim() !== value) onCommit(draft.trim())
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Source</span>
          {/* Beside the label rather than on the URL itself: the URL is the button that
              starts an edit, and one control cannot both open a page and put a cursor in
              it. Absent with no source, since there is nothing to open. */}
          {value && (
            <button
              type="button"
              onClick={() => void window.api.openExternal(value)}
              title="Open the source in your browser"
              className="text-xs text-muted transition-colors hover:text-foreground"
            >
              🔗 Open
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setDraft(value)
            setEditing(true)
          }}
          title="Click to edit"
          className="min-h-9 w-full truncate rounded-lg border border-transparent px-3 py-1.5 text-left text-sm transition-colors hover:border-border"
        >
          {value ? (
            <span className="text-accent">{value}</span>
          ) : (
            <span className="text-muted">No source — click to add one</span>
          )}
        </button>
      </div>
    )
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">Source</span>
      <input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={done}
        onKeyDown={(event) => {
          if (event.key === 'Enter') done()
          // Escape abandons the edit — the way back out of a URL half-pasted
          if (event.key === 'Escape') setEditing(false)
        }}
        placeholder="https://…"
        spellCheck={false}
        className="min-h-9 rounded-lg border border-accent bg-surface px-3 text-sm outline-none"
      />
    </label>
  )
}

/**
 * Delete, drawn as what it is. It removes the row and both stored images with no undo, on
 * a screen where every other control writes on a single click — so it asks, in a panel
 * that says exactly what goes, and the button that does it is filled rather than outlined
 * and sits where the hand was not already travelling.
 */
function DeletePanel({
  postId,
  busy,
  confirming,
  onAsk,
  onCancel,
  onConfirm,
}: {
  postId: number
  busy: boolean
  confirming: boolean
  onAsk: () => void
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!confirming) {
    return (
      <div className="flex justify-end border-t border-border pt-3">
        <button
          type="button"
          onClick={onAsk}
          className="min-h-9 px-2 text-sm text-muted transition-colors hover:text-[#ff5d5f]"
        >
          Delete
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border-2 border-[#ff5d5f] bg-[#ff5d5f]/5 p-4">
      <div>
        <h2 className="text-sm font-bold text-[#ff5d5f]">⚠ Delete post #{postId} for good</h2>
        <p className="mt-1 text-sm text-muted">
          The row, the stored image and its thumbnail are all removed from the board, and
          every link to this post stops working.{' '}
          <strong className="text-foreground">There is no undo</strong> and nothing else
          holds a copy.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="min-h-9 rounded-lg bg-[#ff5d5f] px-4 text-sm font-semibold text-[#0d0f14] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Deleting…' : 'Delete permanently'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-9 rounded-lg border border-border px-4 text-sm transition-colors hover:bg-surface"
        >
          Keep it
        </button>
      </div>
    </div>
  )
}
