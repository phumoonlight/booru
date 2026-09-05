'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { Post } from '@/lib/data/posts'
import { PostGrid, PostGridSkeleton } from '@/components/post-grid'
import { NavProgress } from '@/components/nav-progress'
import { loadMorePosts } from '@/lib/actions/search'
import { searchHref, withStart } from '@common/search'

/**
 * How close to the sentinel the viewport gets before the next chunk is asked for.
 *
 * Deliberately less than a row: a chunk is ten posts now, so a generous lookahead
 * chain-fired — the chunk landed, the sentinel was still inside the margin, and the next
 * request went out before the reader had scrolled at all. Half a screen of lookahead
 * cost nothing when a chunk was two dozen posts and everything when it is ten.
 */
const PREFETCH_MARGIN = '100px'

/**
 * The seam between two loaded chunks, labelled with the post the chunk starts at. A feed
 * with no seams is disorienting — you cannot tell how far you have come, and a post you
 * saw a while ago has no landmark to scroll back to. The id is that landmark, and it is
 * also the address: `start:` that number is this exact view.
 */
function ChunkDivider({ firstId }: { firstId: number }) {
  return (
    <div aria-hidden className="flex items-center gap-3 py-1 text-xs text-muted">
      <span className="h-px flex-1 bg-border" />#{firstId}
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

/**
 * The gallery as one continuous feed: the server renders the newest screenful, and this
 * appends older ones as you reach the bottom.
 *
 * Each chunk keeps its own grid rather than being merged into one list. That leaves a
 * ragged last row where a chunk ends, which is exactly what the divider is drawn
 * across — the alternative reflows posts you have already scrolled past into different
 * rows every time a chunk lands.
 *
 * `resumable` is the difference between the two listings that use this. The gallery is
 * addressable at any depth, so its "load more" is a real `<a href="?query=… start:N">` —
 * a chain a crawler and a JS-less browser can follow — and `replaceState` keeps the URL
 * on the chunk you are *looking at*, so a refresh puts you back there. Ids being
 * integers, `start:` one below the oldest post shown is exactly "everything older".
 * The tag page is a sample rather than an address: it caps out and hands you a link into
 * the gallery, so there is nothing to keep in the URL and its control is a plain button.
 *
 * Auto-loading usually beats the button to it, but the button stays visible regardless:
 * an observer that never fires (a failed chunk, a viewport tall enough that nothing
 * scrolls) must not be the only way forward.
 */
export function PostFeed({
  initialPosts,
  query,
  hasMore: initialHasMore,
  perPage,
  limit,
  resumable = false,
  moreHref,
  moreLabel,
}: {
  initialPosts: Post[]
  /** The listing's query. On /tags/[id] that is the tag name, which is why it is a prop
      and not read back out of the URL. */
  query: string
  hasMore: boolean
  /** Chunk size, when this listing runs at something other than the gallery's. */
  perPage?: number
  /** Stop after this many posts and offer `moreHref` instead. */
  limit?: number
  resumable?: boolean
  /** Where the listing ends: the tag page's way into the gallery. */
  moreHref?: string
  moreLabel?: string
}) {
  // One entry per chunk, the server's first screenful included — the shape the dividers
  // are drawn from, so "where does a chunk begin" needs no arithmetic over a flat list.
  const [chunks, setChunks] = useState<Post[][]>([initialPosts])
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  // A ref, not `pending`: the observer can fire twice before a state update paints
  const busy = useRef(false)

  // Which chunk the top of the viewport is sitting in — the value the URL follows.
  //
  // It used to follow the newest chunk *fetched*, written once as each one landed. That
  // answered "how far did you get", so scrolling back up to look at something left the
  // address bar pointing at the bottom of the feed, and a refresh threw away the place
  // you had scrolled back to. This answers "what are you looking at", which is the thing
  // a URL is for.
  //
  // The grids are watched rather than counted: `chunks` only ever grows, so an index is
  // stable once assigned, and the map is keyed by the element so a callback can name its
  // chunk without a scan.
  const grids = useRef(new Map<HTMLUListElement, number>())
  const passed = useRef(new Set<number>())
  const [current, setCurrent] = useState(0)

  const loaded = chunks.reduce((count, chunk) => count + chunk.length, 0)
  const capped = limit !== undefined && loaded >= limit
  const oldest = chunks[chunks.length - 1]?.at(-1)
  const canLoad = hasMore && !capped && oldest !== undefined

  const load = useCallback(async () => {
    if (busy.current || !canLoad || !oldest) return

    busy.current = true
    setPending(true)
    setFailed(false)
    try {
      const next = await loadMorePosts({ query, after: oldest.id, perPage })
      setHasMore(next.hasMore)
      // An empty chunk would draw a divider over nothing
      if (next.posts.length === 0) return

      setChunks((current) => [...current, next.posts])
    } catch {
      // Auto-loading stops here; the button stays and says so, so a dropped connection
      // costs a tap rather than the rest of the gallery.
      setFailed(true)
    } finally {
      busy.current = false
      setPending(false)
    }
  }, [canLoad, oldest, perPage, query])

  useEffect(() => {
    if (!resumable) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = grids.current.get(entry.target as HTMLUListElement)
          if (index === undefined) continue
          // Above the line or below it: the sign is the whole answer, and it is reported
          // for every grid once at `observe()` as well as on each crossing, so scrolling
          // in either direction and the initial position are all the same code path.
          if (entry.boundingClientRect.top <= 0) passed.current.add(index)
          else passed.current.delete(index)
        }
        setCurrent(passed.current.size > 0 ? Math.max(...passed.current) : 0)
      },
      // A root with no height, pinned to the top of the viewport. The deepest grid that
      // has crossed it is the one being read.
      { rootMargin: '0px 0px -100% 0px' }
    )
    for (const node of grids.current.keys()) observer.observe(node)
    return () => observer.disconnect()
  }, [resumable, chunks.length])

  // `replaceState`, never `pushState`: a feed that pushed would make Back walk up through
  // every chunk you scrolled past instead of leaving the gallery. Chunk zero restores the
  // query as it arrived — writing `start:` the newest post would put a cursor in the URL
  // of a listing nobody has scrolled yet.
  useEffect(() => {
    if (!resumable) return
    const first = chunks[current]?.[0]
    const at = current === 0 || !first ? query : withStart(query, first.id)
    window.history.replaceState(null, '', searchHref(at))
  }, [current, chunks, query, resumable])

  useEffect(() => {
    const node = sentinel.current
    if (!node || !canLoad || failed) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) load()
      },
      { rootMargin: PREFETCH_MARGIN }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [load, canLoad, failed])

  const controlClass =
    'flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-6 text-sm transition-colors hover:border-accent'
  const label = pending ? 'Loading…' : failed ? 'Failed to load — try again' : 'Load more'

  return (
    <>
      {chunks.map((posts, index) => (
        <Fragment key={posts[0]?.id ?? index}>
          {index > 0 && posts[0] && <ChunkDivider firstId={posts[0].id} />}
          <PostGrid
            posts={posts}
            query={query}
            ref={(node) => {
              if (!node) return
              grids.current.set(node, index)
              return () => {
                grids.current.delete(node)
              }
            }}
          />
        </Fragment>
      ))}
      {pending && <PostGridSkeleton count={6} />}

      {canLoad && (
        <div className="flex flex-col items-center gap-2">
          <div ref={sentinel} aria-hidden />
          {resumable && oldest ? (
            <a
              href={searchHref(withStart(query, oldest.id - 1))}
              onClick={(event) => {
                // Plain left-click only: cmd/ctrl-click and middle-click still open the
                // next stretch in a tab, which is the point of it being a link.
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
                event.preventDefault()
                load()
              }}
              rel="next"
              aria-busy={pending}
              className={controlClass}
            >
              {label}
            </a>
          ) : (
            <button type="button" onClick={load} aria-busy={pending} className={controlClass}>
              {label}
            </button>
          )}
        </div>
      )}

      {!canLoad && moreHref && (
        <Link href={moreHref} className={`${controlClass} self-center`}>
          {moreLabel ?? 'See more'}
          <NavProgress />
        </Link>
      )}

      {!canLoad && !moreHref && chunks.length > 1 && (
        <p className="py-2 text-center text-sm text-muted">🔚 End of results. Have a nice day.</p>
      )}
    </>
  )
}
