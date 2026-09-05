import { useCallback, useEffect, useRef, useState } from 'react'
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

/**
 * And what it was looking *at*: the rows already read for `lastQuery`, chunks from Load
 * more included. Same reasoning as the box, one step further — this screen is unmounted
 * whenever another view is in front of it, so opening Settings and coming back used to
 * re-run the search and re-fetch every thumbnail to arrive at the grid that was already
 * on screen a second ago. The board does not change while you are reading About.
 *
 * A cache that can go stale needs a way to say so, which is the 🔄 beside the title, and
 * `invalidateBrowse()` for the one moment the app knows it is wrong.
 */
let cached: { query: string; posts: Post[]; hasMore: boolean; at: number } | null = null

function remember(query: string, posts: Post[], hasMore: boolean): void {
  // `at` is the last read, Load more included: what the line beside the title answers is
  // "how old is what I am looking at", and a chunk that landed a second ago is part of it.
  cached = { query, posts, hasMore, at: Date.now() }
}

/**
 * Drops the remembered grid without reading anything, so the next visit asks the board.
 * Called when an upload lands — the one change this window makes that the grid cannot
 * see, an edit being something it walked into the editor to do.
 */
export function invalidateBrowse(): void {
  cached = null
}

/**
 * Thumbnails already across the bridge, by file name. `main/manage.ts` caches the bytes
 * on its side, so this saves the IPC round trip and the re-decode rather than the
 * download — enough to make a returning grid paint in one frame instead of filling in
 * tile by tile. Never invalidated: the name is the file's md5, so a name that comes back
 * is the same image by definition.
 */
const thumbnails = new Map<string, string>()

/**
 * A post's thumbnail, from that cache or from the bridge. Exported because the upload
 * screen's tag import draws the same grid of posts, and a second copy of every image in
 * the window is the one thing this cache exists to avoid.
 */
export async function thumbnailFor(fileName: string): Promise<string> {
  const held = thumbnails.get(fileName)
  if (held !== undefined) return held

  const url = await window.api.postThumbnail(fileName)
  // A failed fetch answers '' — not remembered, so asking again re-asks the board.
  if (url) thumbnails.set(fileName, url)
  return url
}

const CHUNK = 24

/**
 * A query that is nothing but a post number, or null.
 *
 * Typing `11` into this box means post 11 far more often than it means a tag called `11`,
 * and reaching one post by its number is what this window is usually for — you have the
 * id from an upload, from the board, from a report. It is a convenience of *this box* and
 * not of the search grammar: `@common/data/search` is shared with the website and there is
 * one implementation of it, so a bare number still means a tag everywhere else.
 *
 * The tag reading is not given up, only tried second — `2024` is a plausible tag name, and
 * a board that has one would otherwise lose it to a post number that may not even exist.
 */
function asPostId(query: string): number | null {
  const value = Number(query.trim())
  return /^\d+$/.test(query.trim()) && Number.isSafeInteger(value) && value > 0 ? value : null
}

/**
 * One post, shaped like a page, so the id lookup and the search return the same thing.
 *
 * Exported for the upload screen's tag import, which is this box in a dialog: typing a
 * post number there means the same thing it means here, and a second implementation of
 * that convenience would be a second place for it to disagree.
 */
export async function readPosts(query: string): Promise<{ posts: Post[]; hasMore: boolean }> {
  const id = asPostId(query)
  if (id !== null) {
    const loaded = await window.api.getPost(id)
    if (loaded) return { posts: [loaded.post], hasMore: false }
  }
  return window.api.searchPosts({ query })
}

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
  // The cache is only ever held for `lastQuery`, which is where the box below starts,
  // so the two agree by construction — checked rather than assumed, since a grid seeded
  // with rows that answer another query is the one way this could lie.
  const seed = cached?.query === lastQuery ? cached : null

  const [query, setQuery] = useState(lastQuery)
  const [submitted, setSubmitted] = useState(lastQuery)
  const [posts, setPosts] = useState<Post[]>(seed?.posts ?? [])
  const [hasMore, setHasMore] = useState(seed?.hasMore ?? false)
  const [fetchedAt, setFetchedAt] = useState<number | null>(seed?.at ?? null)
  const [loading, setLoading] = useState(seed === null)
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

  // True for exactly one render: the mount that was seeded from the cache. The effect
  // below runs on mount whatever state was seeded with, and this is what stops it turning
  // the seed into the read it was meant to save.
  const seeded = useRef(seed !== null)

  useEffect(() => {
    if (seeded.current) {
      seeded.current = false
      return
    }
    let alive = true
    void readPosts(submitted).then((page) => {
      remember(submitted, page.posts, page.hasMore)
      if (!alive) return
      setPosts(page.posts)
      setHasMore(page.hasMore)
      setFetchedAt(cached?.at ?? null)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [submitted, nonce])

  /** Answers with what it appended, so the editor's → can step straight into it. */
  async function loadMore(): Promise<Post[]> {
    const last = posts[posts.length - 1]
    if (!last) return []
    setLoading(true)
    const page = await window.api.searchPosts({ query: submitted, after: last.id })
    // Appended, never replaced: a chunk landing must not reflow rows already scrolled past.
    setPosts((current) => {
      const next = [...current, ...page.posts]
      // Remembered here too, or coming back would drop every chunk but the first and
      // leave you scrolling the same rows a second time.
      remember(submitted, next, page.hasMore)
      return next
    })
    setHasMore(page.hasMore)
    setFetchedAt(cached?.at ?? null)
    setLoading(false)
    return page.posts
  }

  /** What the cache costs: one button that says the grid may be old and reads it again. */
  function refresh() {
    invalidateBrowse()
    setLoading(true)
    setNonce((n) => n + 1)
  }

  function submit(next: string) {
    lastQuery = next
    // The remembered rows answer the old query and would otherwise sit under the new one
    // until the read lands.
    invalidateBrowse()
    setLoading(true)
    setSubmitted(next)
    setNonce((n) => n + 1)
  }

  /** A deleted post has nothing left to edit, so that one does leave — and the grid it
   *  returns to is holding a row that is gone. */
  const closeAndReload = useCallback(() => {
    setEditing(null)
    setStale(false)
    invalidateBrowse()
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
    // Where the open post sits in the grid, and so what ← and → mean. -1 when it was
    // opened from somewhere the grid has no row for — the queue's Review after an upload
    // — where both arrows are simply dead.
    const at = posts.findIndex((post) => post.id === editing)
    const previous = at > 0 ? posts[at - 1] : null
    const next = at >= 0 ? (posts[at + 1] ?? null) : null

    return (
      <PostEditor
        // Keyed, so stepping to another post mounts a fresh screen rather than leaving
        // the last one's tags and picture up until the read lands.
        key={editing}
        postId={editing}
        siteUrl={siteUrl}
        onSaved={() => setStale(true)}
        onDeleted={closeAndReload}
        onClose={close}
        onPrev={previous ? () => setEditing(previous.id) : null}
        onNext={
          next
            ? () => setEditing(next.id)
            : // The end of what has been read is not the end of the search: → reads the
              // next chunk and steps into it, the same thing Load more does behind here.
              at >= 0 && hasMore
              ? () => {
                  void loadMore().then((more) => {
                    if (more[0]) setEditing(more[0].id)
                  })
                }
              : null
        }
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
        {/* What a cache owes you, same as the Tags screen: how old the grid is, in time
            only — the date is never the answer to "should I press refresh". */}
        {fetchedAt !== null && (
          <span className="text-xs text-muted">
            as of {new Date(fetchedAt).toLocaleTimeString([], { timeStyle: 'short' })}
          </span>
        )}
        {/* Right of the row, away from Search: this one asks the same question again
            rather than a new one. */}
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          title="Read these posts again"
          className="ml-auto min-h-9 rounded-lg border border-border px-3 text-sm transition-colors hover:bg-surface disabled:text-border"
        >
          <span aria-hidden>🔄</span> Refresh
        </button>
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
