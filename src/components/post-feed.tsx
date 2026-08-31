'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { Post } from '@/lib/data/posts'
import { PostGrid, PostGridSkeleton } from '@/components/post-grid'
import { loadMorePosts } from '@/lib/actions/search'
import { FROM_PARAM } from '@/lib/search'

/** How close to the sentinel the viewport gets before the next chunk is asked for. */
const PREFETCH_MARGIN = '800px'

/**
 * `?from=N` on whatever path we are already on. It builds its own URL rather than
 * taking a `buildHref` closure — one cannot cross into a client component — and that
 * works because both listings spell the cursor the same way.
 */
function cursorUrl(from: number): string {
  const url = new URL(window.location.href)
  url.searchParams.set(FROM_PARAM, String(from))
  return `${url.pathname}${url.search}`
}

/**
 * The seam between two loaded chunks, labelled with the post the chunk starts at. A
 * feed with no seams is disorienting — you cannot tell how far you have come, and a
 * post you saw a while ago has no landmark to scroll back to. The id is that landmark,
 * and it is also the address: `?from=` that number is this exact view.
 */
function ChunkDivider({ firstId }: { firstId: number }) {
  return (
    <div aria-hidden className="flex items-center gap-3 py-1 text-xs text-muted">
      <span className="h-px flex-1 bg-border" />#{firstId} and older
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
 * Three things it deliberately keeps from the numbered bar it replaced:
 *
 * - **A real link onward.** The button is an `<a href="?from=…">` with its click
 *   intercepted, so a crawler — and a browser whose JS has not arrived — still has a
 *   chain to follow through the whole gallery. Infinite scroll that renders no link
 *   makes everything past the first chunk unreachable to both. Ids being integers,
 *   `from = lastId - 1` is exactly "everything older than the last post shown".
 * - **A visible control.** Auto-loading usually wins the race, but an observer that
 *   never fires (a failed chunk, reduced-motion scroll containers, a viewport tall
 *   enough that nothing scrolls) must not be the only way forward.
 * - **A URL that survives a refresh**, rewritten with `replaceState` as chunks land —
 *   the cursor now, rather than a page number, which is the better half of that trade:
 *   a page number moves when someone uploads, an id does not. It restores the chunk you
 *   had reached, not the ones above it, which is an honest URL for a feed.
 */
export function PostFeed({
  initialPosts,
  query,
  hasMore: initialHasMore,
  nextHref,
}: {
  initialPosts: Post[]
  /** Search string for the data layer. On /tags/[id] that is the tag name, which is why
      it is a prop and not read back out of the URL. */
  query: string
  hasMore: boolean
  nextHref: string
}) {
  // One entry per chunk, the server's first screenful included — the shape the dividers
  // are drawn from, so "where does a chunk begin" needs no arithmetic over a flat list.
  const [chunks, setChunks] = useState<Post[][]>([initialPosts])
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [href, setHref] = useState(nextHref)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  // A ref, not `pending`: the observer can fire twice before a state update paints
  const busy = useRef(false)

  const load = useCallback(async () => {
    const last = chunks[chunks.length - 1]?.at(-1)
    if (busy.current || !hasMore || !last) return

    busy.current = true
    setPending(true)
    setFailed(false)
    try {
      const next = await loadMorePosts({ query, after: last.id })
      setHasMore(next.hasMore)
      // An empty chunk would draw a divider over nothing
      if (next.posts.length === 0) return

      setChunks((current) => [...current, next.posts])
      // The URL claims the chunk that just landed, so a refresh resumes there
      window.history.replaceState(null, '', cursorUrl(next.posts[0].id))
      setHref(cursorUrl(next.posts[next.posts.length - 1].id - 1))
    } catch {
      // Auto-loading stops here; the button stays and says so, so a dropped connection
      // costs a tap rather than the rest of the gallery.
      setFailed(true)
    } finally {
      busy.current = false
      setPending(false)
    }
  }, [chunks, hasMore, query])

  useEffect(() => {
    const node = sentinel.current
    if (!node || !hasMore || failed) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) load()
      },
      { rootMargin: PREFETCH_MARGIN }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [load, hasMore, failed])

  return (
    <>
      {chunks.map((posts, index) => (
        <Fragment key={posts[0]?.id ?? index}>
          {index > 0 && posts[0] && <ChunkDivider firstId={posts[0].id} />}
          <PostGrid posts={posts} query={query} />
        </Fragment>
      ))}
      {pending && <PostGridSkeleton count={6} />}

      {hasMore && (
        <div className="flex flex-col items-center gap-2">
          <div ref={sentinel} aria-hidden />
          <a
            href={href}
            onClick={(event) => {
              // Plain left-click only: cmd/ctrl-click and middle-click still open the
              // next stretch in a tab, which is the whole point of it being a link.
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
              event.preventDefault()
              load()
            }}
            rel="next"
            aria-busy={pending}
            className="flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-6 text-sm transition-colors hover:border-accent"
          >
            {pending ? 'Loading…' : failed ? 'Failed to load — try again' : 'Load more'}
          </a>
        </div>
      )}

      {!hasMore && chunks.length > 1 && (
        <p className="py-2 text-center text-sm text-muted">🔚 End of results. Have a nice day.</p>
      )}
    </>
  )
}
