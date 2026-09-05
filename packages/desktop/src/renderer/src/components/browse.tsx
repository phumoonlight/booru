import { useCallback, useEffect, useState } from 'react'
import { RATING_COLOR, RATING_LABEL } from '@common/search'
import type { Post } from '@common/data/posts'
import { PostEditor } from './post-editor'

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

export function Browse({
  siteUrl,
  initialEdit = null,
}: {
  siteUrl: string
  /**
   * A post to open the editor on straight away — the queue's Review after an upload. A
   * prop rather than the module-level trick `lastQuery` uses, because this screen is
   * mounted fresh every time it is switched to, so the prop is read exactly once and a
   * second visit doesn't reopen an editor nobody asked for.
   */
  initialEdit?: number | null
}) {
  const [query, setQuery] = useState(lastQuery)
  const [submitted, setSubmitted] = useState(lastQuery)
  const [posts, setPosts] = useState<Post[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<number | null>(initialEdit)
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
