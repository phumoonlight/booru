import { useEffect, useRef, useState } from 'react'
import type { Board } from '@common/board'
import { postHref, RATING_COLOR, RATING_LABEL, RATINGS, type Rating } from '@common/search'
import type { Post } from '@common/data/posts'
import { BUTTON, BUTTON_SM } from './buttons'
import { CategoryTagField } from './category-tag-field'
import type { TagSeed } from './tag-seed'
import { invalidateTags } from './tag-index-store'

import { DeletePanel, formatBytes, NavButton, PostNumber, SourceField } from './post-editor-parts'

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
  board = 'post',
  siteUrl,
  onSaved,
  onDeleted,
  onClose,
  onPrev = null,
  onNext = null,
  onJump = null,
}: {
  postId: number
  /** Which board the post is on. Every write here names it, so an edit begun before the
      mode was switched still lands on the row it opened. */
  board?: Board
  siteUrl: string
  /** A write landed: the grid behind this screen is now holding a stale row. */
  onSaved: () => void
  onDeleted: () => void
  onClose: () => void
  /**
   * The neighbouring posts in the grid this was opened from, or null at either end.
   * Correcting a run of ratings is the common job here and it used to cost a trip back
   * to the grid per post, which re-read nothing but still lost your place on the screen.
   */
  onPrev?: (() => void) | null
  onNext?: (() => void) | null
  /**
   * Open a post by number, typed into the heading. The grid behind this screen may not
   * hold it — that is the point of typing one — so this is a different thing from
   * `onPrev`/`onNext`, which step within what was searched.
   */
  onJump?: ((id: number) => void) | null
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
    void window.api.getPost(postId, board).then((loaded) => {
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
      void window.api.postThumbnail(loaded.post.file_name, board).then((url) => {
        if (alive) setThumb(url)
      })
    })
    return () => {
      alive = false
    }
  }, [postId, board])

  /**
   * ← and → walk the grid. On `window`, because there is nothing on this screen that
   * would sensibly hold focus for it — but a text field is exactly where an arrow key
   * means "move the caret", so the two typed fields opt out by being the focused element.
   */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return
      }
      if (event.key === 'ArrowLeft' && onPrev) {
        event.preventDefault()
        onPrev()
      } else if (event.key === 'ArrowRight' && onNext) {
        event.preventDefault()
        onNext()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onPrev, onNext])

  async function commit(next: typeof value) {
    const previous = value
    const id = ++writeId.current
    setValue(next)
    setStatus('saving')
    setError('')

    const result = await window.api.savePost({
      id: postId,
      board,
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
    // The edit may have moved a tag's post_count; the Tags screen's copy of the index is
    // now wrong about it.
    invalidateTags()
    setStatus('saved')
    onSaved()
  }

  async function remove() {
    setBusy(true)
    setError('')
    const result = await window.api.deletePost(postId, board)
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
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 pb-25">
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          Post {postId} is not on the board any more.
        </p>
        <button type="button" onClick={onClose} className={`${BUTTON} mx-auto mt-4`}>
          <span aria-hidden>⬅️</span> Back
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-4 pb-25">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Back leads the row, where the way out of a screen is looked for. It used to
              sit at the far end of the header, which put the control that leaves furthest
              from the hand and the two that stay closest. */}
          <button type="button" onClick={onClose} className={BUTTON_SM}>
            <span aria-hidden>⬅️</span> Back
          </button>
          <PostNumber id={postId} onJump={onJump} />
          {/* After the number rather than before it, because it is the number they
              change: pressed, the thing that moves is the next word along. Both stay on
              screen at the ends of the grid, disabled — a control that disappears is one
              you have to look for. */}
          <div className="flex items-center">
            <NavButton label="Previous post (←)" glyph="◀️" onClick={onPrev} />
            <NavButton label="Next post (→)" glyph="▶️" onClick={onNext} />
          </div>
          {/* Everything here writes as it is used, so this line is the whole feedback the
              screen gives: what happened to the last edit, and nothing else. */}
          <span className="text-xs text-muted">
            {status === 'saving' ? 'saving…' : status === 'saved' ? 'saved' : ''}
          </span>
        </div>
        {siteUrl && (
          <button
            type="button"
            // `postHref` rather than a literal path, which is the web's own rule about
            // which file spells one — and it is what puts an AI post on `/ai-posts/<id>`.
            onClick={() => void window.api.openExternal(`${siteUrl}${postHref(postId, '', board)}`)}
            className={BUTTON_SM}
          >
            <span aria-hidden>🖼️</span> Open on the board
          </button>
        )}
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
