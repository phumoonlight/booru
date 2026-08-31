'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { Post } from '@/lib/data/posts'
import { PostGrid, PostGridSkeleton } from '@/components/post-grid'
import { loadMorePosts } from '@/lib/actions/search'

/** How close to the sentinel the viewport gets before the next chunk is asked for. */
const PREFETCH_MARGIN = '800px'

/**
 * `?page=N` on whatever path we are already on. Like PageJump before it, this builds
 * its own URL rather than taking a `buildHref` closure — one can't cross into a client
 * component — and that works because every listing that pages spells it the same way:
 * `?page=N` on the current path, page 1 dropping the param so the canonical URL is clean.
 */
function pageUrl(page: number): string {
  const url = new URL(window.location.href)
  if (page > 1) url.searchParams.set('page', String(page))
  else url.searchParams.delete('page')
  return `${url.pathname}${url.search}`
}

/**
 * The seam between two loaded chunks. A feed with no seams is disorienting — you cannot
 * tell how far you have come, and a post you saw "a while ago" has no landmark to
 * scroll back to. Labelling it with the page number gives it one, and it is the same
 * number the URL now claims, so the divider and a refresh agree.
 */
function ChunkDivider({ page }: { page: number }) {
  return (
    <div aria-hidden className="flex items-center gap-3 py-1 text-xs text-muted">
      <span className="h-px flex-1 bg-border" />
      Page {page}
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

/**
 * The gallery as one continuous feed: the server renders the first screenful, and this
 * appends the rest as you reach the bottom.
 *
 * Each chunk keeps its own grid rather than being merged into one list. That leaves a
 * ragged last row where a chunk ends, which is exactly what the divider is drawn
 * across — the alternative reflows posts you have already scrolled past into different
 * rows every time a chunk lands.
 *
 * Three things it deliberately keeps from the numbered bar it replaced:
 *
 * - **A real link to the next page.** The button is an `<a href="?page=N+1">` with its
 *   click intercepted, so a crawler — and a browser whose JS hasn't arrived — still has
 *   a chain to follow through the whole gallery. Infinite scroll that renders no link
 *   makes everything past the first chunk unreachable to both.
 * - **A visible control.** Auto-loading usually wins the race, but an observer that
 *   never fires (a failed chunk, reduced-motion scroll containers, a viewport tall
 *   enough that nothing scrolls) must not be the only way forward.
 * - **The page number in the URL**, rewritten with `replaceState` as chunks land, so a
 *   refresh doesn't drop you back at post 1. It restores the page you had *reached*,
 *   not the chunks above it — an honest URL for a feed, and the reason `?page=` still
 *   renders on the server exactly as it always did.
 *
 * Paging is by cursor (`beforeId`), not offset: an upload landing mid-scroll would
 * otherwise shift every later row down one and hand you a post you already have.
 */
export function PostFeed({
  initialPosts,
  query,
  page,
  hasMore: initialHasMore,
  nextHref,
}: {
  initialPosts: Post[]
  /** Search string for the data layer. On /tags/[id] that's the tag name, which is why
      it is a prop and not read back out of the URL. */
  query: string
  page: number
  hasMore: boolean
  nextHref: string
}) {
  // One entry per chunk, the server's first screenful included — the shape the dividers
  // are drawn from, so "where does a page begin" needs no arithmetic over a flat list.
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
      const next = await loadMorePosts({ query, beforeId: last.id })
      // An empty chunk would draw a divider over nothing
      if (next.posts.length > 0) setChunks((current) => [...current, next.posts])
      setHasMore(next.hasMore)

      // `chunks` is this render's array, so its length is how many pages deep the feed
      // stands once the chunk being appended is counted
      const reached = page + chunks.length
      window.history.replaceState(null, '', pageUrl(reached))
      setHref(pageUrl(reached + 1))
    } catch {
      // Auto-loading stops here; the button stays and says so, so a dropped connection
      // costs a tap rather than the rest of the gallery.
      setFailed(true)
    } finally {
      busy.current = false
      setPending(false)
    }
  }, [chunks, hasMore, page, query])

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
          {index > 0 && <ChunkDivider page={page + index} />}
          <PostGrid posts={posts} />
        </Fragment>
      ))}
      {pending && <PostGridSkeleton count={6} />}

      {hasMore && (
        <div className="flex flex-col items-center gap-2">
          <div ref={sentinel} aria-hidden />
          <a
            href={href}
            onClick={(event) => {
              // Plain left-click only: ⌘/ctrl-click and middle-click still open the
              // next page in a tab, which is the whole point of it being a link.
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
