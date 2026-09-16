'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { CollectionPost } from '@/lib/data/collections'
import { CollectionGrid } from '@/components/collection-grid'
import { loadMoreCollectionPosts } from '@/lib/actions/collections'

/** Less than a row, so a landing chunk does not chain-fire the next request before anyone
 *  scrolls. */
const PREFETCH_MARGIN = '100px'

/**
 * A collection as one continuous feed: the server renders the newest screenful and this
 * appends older ones on the way down.
 *
 * A shelf scrolls where `/posts` does not (`LatestFeed`): a shelf is a set somebody chose
 * to open and is read to its end, where the site-wide feed is a front page with a horizon.
 * No cursor in the URL — the address of a collection is the collection, and a scrolling
 * position inside it is not somewhere anyone needs to link to. Each chunk keeps its own
 * `<ul>`, so a landing chunk cannot reflow rows already scrolled past.
 */
export function CollectionFeed({
  collectionId,
  tags,
  initialPosts,
  hasMore: initialHasMore,
}: {
  collectionId: number
  /** The pills lit above the feed. Every later chunk is asked for with the same ones, so a
   *  filtered shelf does not turn back into the whole shelf on the way down. */
  tags: string[]
  initialPosts: CollectionPost[]
  hasMore: boolean
}) {
  const [chunks, setChunks] = useState<CollectionPost[][]>([initialPosts])
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  // A ref, not `pending`: the observer can fire twice before a state update paints.
  const busy = useRef(false)

  const oldest = chunks[chunks.length - 1]?.at(-1)
  const canLoad = hasMore && oldest !== undefined

  const load = useCallback(async () => {
    if (busy.current || !canLoad || !oldest) return

    busy.current = true
    setPending(true)
    setFailed(false)
    try {
      const next = await loadMoreCollectionPosts({ collectionId, after: oldest.id, tags })
      setHasMore(next.hasMore)
      if (next.posts.length === 0) return
      setChunks((current) => [...current, next.posts])
    } catch {
      // Auto-loading stops here and the button says so, so a dropped connection costs a
      // tap rather than the rest of the shelf.
      setFailed(true)
    } finally {
      busy.current = false
      setPending(false)
    }
  }, [canLoad, collectionId, oldest, tags])

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

  return (
    <>
      {chunks.map((posts, index) => (
        <Fragment key={posts[0]?.id ?? index}>
          <CollectionGrid posts={posts} />
        </Fragment>
      ))}

      {canLoad && (
        <div className="flex flex-col items-center gap-2">
          <div ref={sentinel} aria-hidden />
          {/* The button stays visible whatever the observer does: one that never fires —
              a failed chunk, a viewport tall enough that nothing scrolls — must not be
              the only way forward. */}
          <button
            type="button"
            onClick={load}
            aria-busy={pending}
            className="flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-6 text-sm transition-colors hover:border-accent"
          >
            {pending ? 'Loading…' : failed ? 'Failed to load — try again' : 'Load more'}
          </button>
        </div>
      )}

      {!canLoad && chunks.length > 1 && (
        <p className="py-2 text-center text-sm text-muted">🔚 End of collection.</p>
      )}
    </>
  )
}
