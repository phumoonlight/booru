import { useCallback, useEffect, useRef, useState } from 'react'
import type { Board } from '@common/board'
import type { Post } from '@common/data/posts'
import { PostEditor } from './post-editor'
import { BUTTON, SEGMENTS, segment } from './buttons'
import { Card } from './browse-card'
import { BrowseSearchBox } from './browse-search-box'
import { itemStyle } from './browse-layout'
import {
  cached,
  CHUNK,
  invalidateBrowse,
  lastQuery,
  readAt,
  readPosts,
  remember,
} from './browse-store'

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
 * rating:r18` narrows to the same rows in both places. There is one grammar and
 * one implementation of it.
 *
 * Thumbnails come across the bridge as `data:` URLs (`main/manage.ts`). The window's CSP
 * is `img-src 'self' data:` and stays that way — a grid is not worth being the reason
 * this page can reach the network.
 *
 * **Everything remembered here is per board** (`renderer/src/board-store.ts`). The query
 * you were running and the rows it found are two different screens on the two boards, and
 * one slot would mean switching mode twice to get back to what you were doing. `App` keys
 * this view on the board, so switching remounts it and it seeds from that board's copy.
 */
/**
 * How the grid is drawn. Module-level for the same reason the query is: this view is
 * unmounted whenever another is in front of it, and a layout you chose two screens ago is
 * not a thing you should have to choose again. Not written out, unlike the rows and the
 * query: those are a cache of what the board said, droppable and dated, and this is a
 * preference — which would make it `save.json`'s, and it is not worth being one.
 */
type Layout = 'grid' | 'ratio'
let layout: Layout = 'grid'

export function Browse({
  siteUrl,
  board,
  initialEdit = null,
}: {
  siteUrl: string
  /**
   * Which board is being browsed. `App` also keys this component on it, so a switch is a
   * fresh mount that seeds from that board's remembered query and grid rather than an
   * update that would leave the other board's rows on screen while the read ran.
   */
  board: Board
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
  const held = cached[board] ?? null
  const seed = held?.query === lastQuery[board] ? held : null

  const [query, setQuery] = useState(lastQuery[board])
  const [submitted, setSubmitted] = useState(lastQuery[board])
  const [posts, setPosts] = useState<Post[]>(seed?.posts ?? [])
  const [hasMore, setHasMore] = useState(seed?.hasMore ?? false)
  const [fetchedAt, setFetchedAt] = useState<number | null>(seed?.at ?? null)
  const [loading, setLoading] = useState(seed === null)
  const [editing, setEditing] = useState<number | null>(initialEdit)
  // A save leaves the grid's copy of that row stale. It is not re-read then — the editor
  // is still the screen in front, and swapping it out was the old behaviour this replaced
  // — so the debt is noted here and paid on the way back out.
  const [stale, setStale] = useState(false)
  // Mirrors the module-level `layout` into React so a press repaints; the module copy is
  // what the next visit reads.
  const [drawnAs, setDrawnAs] = useState<Layout>(layout)

  // The read is a request to the main process, not a state sync, so the answer sets
  // state from the callback rather than the effect body — the effect itself touches
  // nothing, and a screen left before the reply lands is left alone.
  //
  // `nonce` is what makes Search re-run on a query that has not changed. `submitted`
  // alone would not: pressing Search after an edit is exactly how you ask for the same
  // rows again, and a dependency that compares equal never fires.
  const [nonce, setNonce] = useState(0)

  // What the rows on screen were read for. The effect below runs on mount whatever state
  // was seeded with, and this is what stops it turning the seed into the read it was meant
  // to save. A key rather than a flag flipped once: StrictMode mounts this view twice, so
  // a one-shot flag is spent by the first run and the second replaces a grid of several
  // chunks with a fresh first one — which is exactly what visiting Tags and coming back
  // used to do.
  const readFor = useRef<string | null>(seed !== null ? `${lastQuery[board]}:0` : null)

  useEffect(() => {
    const key = `${submitted}:${nonce}`
    if (readFor.current === key) return
    readFor.current = key
    void readPosts(submitted, board).then((page) => {
      remember(submitted, page.posts, page.hasMore, board)
      // A reply the screen has moved on from is dropped here rather than by a flag the
      // cleanup clears: StrictMode tears the first mount's effect down immediately, and a
      // flag would cancel the only read this view ever runs.
      if (readFor.current !== key) return
      setPosts(page.posts)
      setHasMore(page.hasMore)
      setFetchedAt(cached[board]?.at ?? null)
      setLoading(false)
    })
  }, [submitted, nonce, board])

  /** Answers with what it appended, so the editor's → can step straight into it. */
  async function loadMore(): Promise<Post[]> {
    const last = posts[posts.length - 1]
    if (!last) return []
    setLoading(true)
    const page = await window.api.searchPosts({
      query: submitted,
      after: last.id,
      perPage: CHUNK,
      board,
    })
    // Appended, never replaced: a chunk landing must not reflow rows already scrolled past.
    setPosts((current) => {
      const next = [...current, ...page.posts]
      // Remembered here too, or coming back would drop every chunk but the first and
      // leave you scrolling the same rows a second time.
      remember(submitted, next, page.hasMore, board)
      return next
    })
    setHasMore(page.hasMore)
    setFetchedAt(cached[board]?.at ?? null)
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
    lastQuery[board] = next
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
        board={board}
        siteUrl={siteUrl}
        onSaved={() => setStale(true)}
        onDeleted={closeAndReload}
        onClose={close}
        // Typing a number in the heading goes straight there, whether or not the grid
        // behind holds it — the grid is a search, and a post you have the id for is
        // usually one you were sent rather than one you found.
        onJump={(id) => setEditing(id)}
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-4 pb-25">
      <div className="flex items-baseline gap-2">
        <h1 className="text-lg font-bold tracking-tight">Browse</h1>
        <span className="text-xs text-muted">
          {loading ? 'reading…' : `${posts.length} post${posts.length === 1 ? '' : 's'}`}
        </span>
        {/* What a cache owes you, same as the Tags screen: how old the grid is. The time
            alone was enough while it died with the window; it is kept for a day now, so a
            grid read yesterday says so rather than claiming to be from this morning. */}
        {fetchedAt !== null && (
          <span className="text-xs text-muted">as of {readAt(fetchedAt)}</span>
        )}
        {/* Two ways of looking at the same rows, so a pair rather than one button whose
            label is whichever one you are not in — that reads as a command and gets
            pressed to get back to where you already were. */}
        <div role="group" aria-label="Layout" className={`ml-auto ${SEGMENTS}`}>
          <button
            type="button"
            onClick={() => {
              layout = 'grid'
              setDrawnAs('grid')
            }}
            aria-pressed={drawnAs === 'grid'}
            title="Even columns, every thumbnail cropped square"
            className={segment(drawnAs === 'grid')}
          >
            <span aria-hidden>🔳</span> Grid
          </button>
          <button
            type="button"
            onClick={() => {
              layout = 'ratio'
              setDrawnAs('ratio')
            }}
            aria-pressed={drawnAs === 'ratio'}
            title="Each image at its own shape, in rows of equal height"
            className={segment(drawnAs === 'ratio')}
          >
            <span aria-hidden>📐</span> Ratio
          </button>
        </div>
      </div>

      <BrowseSearchBox
        query={query}
        setQuery={setQuery}
        submitted={submitted}
        loading={loading}
        board={board}
        onRefresh={refresh}
        onSubmit={submit}
      />

      {posts.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {loading ? 'Loading…' : submitted ? 'No posts match that search.' : 'No posts yet.'}
        </p>
      ) : (
        <>
          {/* Centred in the ratio layout: nothing stretches to fill a line any more, so the
              slack is real and putting all of it on the right made every row look like it
              had stopped short of something. Split between both edges it reads as a
              margin. The square grid needs none of this — its columns already fill. */}
          <ul
            className={
              drawnAs === 'ratio'
                ? 'flex flex-wrap justify-center gap-2 [--row-h:9rem] sm:[--row-h:11rem] lg:[--row-h:13rem]'
                : 'grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6'
            }
          >
            {posts.map((post) => (
              <li
                key={post.id}
                className={drawnAs === 'ratio' ? 'shrink-0' : undefined}
                style={drawnAs === 'ratio' ? itemStyle(post.width, post.height) : undefined}
              >
                <Card post={post} layout={drawnAs} onOpen={() => setEditing(post.id)} />
              </li>
            ))}
          </ul>
          {hasMore && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loading}
              className={`${BUTTON} mx-auto`}
            >
              {loading ? (
                <>
                  <span aria-hidden>⏳</span> Loading…
                </>
              ) : (
                <>
                  <span aria-hidden>⬇️</span> Load {CHUNK} more
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  )
}
