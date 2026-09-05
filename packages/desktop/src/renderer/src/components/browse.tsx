import { useCallback, useEffect, useState } from 'react'
import { RATING_COLOR, RATING_LABEL, RATINGS, type Rating } from '@common/search'
import type { Post } from '@common/data/posts'
import { EMPTY_TAGS, TagField, namesOf, type TagFieldValue } from './tag-field'
import { invalidateTags } from './tag-index'

/**
 * Browsing the board, and editing what you find.
 *
 * This is the website's gallery and its post-edit panel, moved here when the site lost
 * its login. The site is read-only now — its anon key has no write policy to use — so
 * changing a rating, retagging a post or deleting one happens in this window or not at
 * all.
 *
 * The query box is the site's search bar: `posts:search` runs `@common/data/search`,
 * which is the same function the listing renders through, so `1girl -solo
 * rating:explicit` narrows to the same rows in both places. There is one grammar and
 * one implementation of it.
 *
 * Thumbnails come across the bridge as `data:` URLs (`main/manage.ts`). The window's CSP
 * is `img-src 'self' data:` and stays that way — a grid is not worth being the reason
 * this page can reach the network.
 */

/** What the last visit was looking at. The view unmounts when another is in front of
 *  it, and coming back to an empty box after finding a post is a search typed twice. */
let lastQuery = ''

const CHUNK = 24

export function Browse({ siteUrl }: { siteUrl: string }) {
  const [query, setQuery] = useState(lastQuery)
  const [submitted, setSubmitted] = useState(lastQuery)
  const [posts, setPosts] = useState<Post[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<number | null>(null)
  // A save leaves the grid's copy of that row stale. It is not re-read then — the editor
  // is still the screen in front, and swapping it out was the old behaviour this replaced
  // — so the debt is noted here and paid on the way back out.
  const [stale, setStale] = useState(false)

  // The read is a request to the main process, not a state sync, so the answer sets
  // state from the callback rather than the effect body — the effect itself touches
  // nothing, and a screen left before the reply lands is left alone.
  //
  // `nonce` is what makes Search re-run on a query that has not changed. `submitted`
  // alone would not: pressing Search after an edit is exactly how you ask for the same
  // rows again, and a dependency that compares equal never fires.
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    void window.api.searchPosts({ query: submitted }).then((page) => {
      if (!alive) return
      setPosts(page.posts)
      setHasMore(page.hasMore)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [submitted, nonce])

  async function loadMore() {
    const last = posts[posts.length - 1]
    if (!last) return
    setLoading(true)
    const page = await window.api.searchPosts({ query: submitted, after: last.id })
    // Appended, never replaced: a chunk landing must not reflow rows already scrolled past.
    setPosts((current) => [...current, ...page.posts])
    setHasMore(page.hasMore)
    setLoading(false)
  }

  function submit(next: string) {
    lastQuery = next
    setLoading(true)
    setSubmitted(next)
    setNonce((n) => n + 1)
  }

  /** A deleted post has nothing left to edit, so that one does leave — and the grid it
   *  returns to is holding a row that is gone. */
  const closeAndReload = useCallback(() => {
    setEditing(null)
    setStale(false)
    setLoading(true)
    setNonce((n) => n + 1)
  }, [])

  /** Back out of the editor, re-reading only if something was actually saved. */
  const close = useCallback(() => {
    if (stale) {
      closeAndReload()
      return
    }
    setEditing(null)
  }, [stale, closeAndReload])

  if (editing !== null) {
    return (
      <PostEditor
        postId={editing}
        siteUrl={siteUrl}
        onSaved={() => setStale(true)}
        onDeleted={closeAndReload}
        onClose={close}
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4">
      <div className="flex items-baseline gap-2">
        <h1 className="text-lg font-bold tracking-tight">Browse</h1>
        <span className="text-xs text-muted">
          {loading ? 'reading…' : `${posts.length} post${posts.length === 1 ? '' : 's'}`}
        </span>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit(query.trim())
        }}
        className="flex gap-2"
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="tags, -excluded, rating:explicit"
          spellCheck={false}
          className="min-h-9 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="min-h-9 rounded-lg border border-border px-3 text-sm transition-colors hover:bg-surface"
        >
          Search
        </button>
        {submitted !== '' && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              submit('')
            }}
            className="min-h-9 rounded-lg border border-border px-3 text-sm text-muted transition-colors hover:bg-surface"
          >
            Clear
          </button>
        )}
      </form>

      {posts.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {loading ? 'Loading…' : submitted ? 'No posts match that search.' : 'No posts yet.'}
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {posts.map((post) => (
              <li key={post.id}>
                <Card post={post} onOpen={() => setEditing(post.id)} />
              </li>
            ))}
          </ul>
          {hasMore && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loading}
              className="mx-auto min-h-9 rounded-lg border border-border px-4 text-sm transition-colors hover:bg-surface disabled:text-border"
            >
              {loading ? 'Loading…' : `Load ${CHUNK} more`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

/**
 * One thumbnail. It asks for its own image rather than being handed one: the grid can
 * hold a few hundred rows after enough scrolling, and fetching them all up front would
 * stall the first screenful behind the last.
 */
function Card({ post, onOpen }: { post: Post; onOpen: () => void }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    let alive = true
    void window.api.postThumbnail(post.file_name).then((url) => {
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
      title={`Edit post ${post.id}`}
      className="group flex w-full flex-col overflow-hidden rounded-lg border border-border bg-surface text-left transition-colors hover:border-accent"
    >
      <div className="grid aspect-square place-items-center overflow-hidden bg-background">
        {src ? (
          <img src={src} alt={`Post ${post.id}`} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted">…</span>
        )}
      </div>
      <span className="flex items-center justify-between gap-1 px-1.5 py-1 text-[11px]">
        <span className="text-muted">#{post.id}</span>
        <span className={RATING_COLOR[post.rating]}>{RATING_LABEL[post.rating]}</span>
      </span>
    </button>
  )
}

/**
 * The edit panel from the post page, as a screen.
 *
 * It loads the post fresh rather than taking the grid's row: the grid may be minutes old
 * by the time a card is clicked, and saving a rating over an edit made since would be a
 * silent overwrite. Tags come back as the field's own seeds, so the colours are right
 * without a second lookup.
 *
 * **Saving stays here.** It used to drop straight back to the grid, which read as the
 * post having been closed rather than written — and a rating typed one keystroke wrong
 * meant finding the card again to fix it. Now Save says Saved and the screen is still
 * the post, so a second correction is the next thing you do rather than the next thing
 * you go looking for. Back is the only way out.
 *
 * Delete asks, and that one does leave: it removes the row and both stored images and
 * there is no undo — the same confirmation the web's form had, for the same reason.
 */
function PostEditor({
  postId,
  siteUrl,
  onSaved,
  onDeleted,
  onClose,
}: {
  postId: number
  siteUrl: string
  onSaved: () => void
  onDeleted: () => void
  onClose: () => void
}) {
  const [tags, setTags] = useState<TagFieldValue>(EMPTY_TAGS)
  const [rating, setRating] = useState<Rating>('g')
  const [sourceUrl, setSourceUrl] = useState('')
  const [post, setPost] = useState<Post | null>(null)
  const [thumb, setThumb] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [missing, setMissing] = useState(false)
  // Cleared by the next edit rather than by a timer: it is answering "did that land",
  // and the honest moment for it to stop saying yes is when the form stops matching
  // what was written.
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let alive = true
    void window.api.getPost(postId).then((loaded) => {
      if (!alive) return
      if (!loaded) {
        setMissing(true)
        return
      }
      setPost(loaded.post)
      setRating(loaded.post.rating)
      setSourceUrl(loaded.post.source_url ?? '')
      setTags({
        tags: loaded.tags.map(({ name, category }) => ({ name, category })),
        draft: '',
      })
      void window.api.postThumbnail(loaded.post.file_name).then((url) => {
        if (alive) setThumb(url)
      })
    })
    return () => {
      alive = false
    }
  }, [postId])

  async function save() {
    setBusy(true)
    setError('')
    const result = await window.api.savePost({
      id: postId,
      tags: namesOf(tags).join(' '),
      rating,
      sourceUrl,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    // The edit may have coined a tag; the Tags screen's copy is now wrong about it.
    invalidateTags()
    setSaved(true)
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
        <h1 className="text-lg font-bold tracking-tight">Post #{postId}</h1>
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
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="w-full shrink-0 sm:w-48">
            <div className="grid aspect-square place-items-center overflow-hidden rounded-lg border border-border bg-surface">
              {thumb ? (
                <img src={thumb} alt={`Post ${postId}`} className="h-full w-full object-contain" />
              ) : (
                <span className="text-xs text-muted">…</span>
              )}
            </div>
            <p className="mt-1 text-center text-[11px] text-muted">
              {post.width}×{post.height} · {post.file_ext}
            </p>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <TagField
              value={tags}
              onChange={(next) => {
                setSaved(false)
                setTags(next)
              }}
              disabled={busy}
            />

            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                Rating
              </span>
              <select
                value={rating}
                onChange={(event) => {
                  setSaved(false)
                  setRating(event.target.value as Rating)
                }}
                disabled={busy}
                className="min-h-9 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-accent"
              >
                {RATINGS.map((tier) => (
                  <option key={tier} value={tier}>
                    {RATING_LABEL[tier]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                Source
              </span>
              <input
                value={sourceUrl}
                onChange={(event) => {
                  setSaved(false)
                  setSourceUrl(event.target.value)
                }}
                disabled={busy}
                placeholder="https://…"
                spellCheck={false}
                className="min-h-9 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
              />
            </label>

            {error && <p className="text-sm text-[#ff5d5f]">{error}</p>}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy}
                className="min-h-9 rounded-lg border border-accent px-4 text-sm text-accent transition-colors hover:bg-surface disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>

              {saved && !busy && <span className="text-xs text-accent">Saved</span>}

              {/* Two presses, not a dialog: the second button is the confirmation, and it
                  says what it will do rather than asking whether you are sure. */}
              {confirming ? (
                <>
                  <button
                    type="button"
                    onClick={() => void remove()}
                    disabled={busy}
                    className="min-h-9 rounded-lg border border-[#ff5d5f] px-4 text-sm text-[#ff5d5f] transition-colors hover:bg-surface disabled:opacity-50"
                  >
                    Delete post and images
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="min-h-9 px-2 text-sm text-muted hover:text-foreground"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  disabled={busy}
                  className="ml-auto min-h-9 px-2 text-sm text-muted transition-colors hover:text-[#ff5d5f]"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
