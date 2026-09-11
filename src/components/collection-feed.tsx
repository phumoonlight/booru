'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { CollectionPost } from '@/lib/data/collections'
import { CollectionGrid } from '@/components/collection-grid'
import { loadMoreCollectionPosts } from '@/lib/actions/collections'

/** The gallery feed's lookahead, and the same number for the same reason — less than a
 *  row, so a landing chunk does not chain-fire the next request before anyone scrolls. */
const PREFETCH_MARGIN = '100px'

/**
 * A collection as one continuous feed: the server renders the newest screenful and this
 * appends older ones on the way down.
 *
 * It is the gallery's `PostFeed` with three things taken out, which is why it is a
 * separate file rather than a prop on that one. There is **no query** — a shelf has no
 * search, so there is nothing for a cursor to ride in and nothing to put in the URL. There
 * is **no `start:`** and so no `replaceState`: the address of a collection is the
 * collection, and a scrolling position inside it is not somewhere anyone needs to link to.
 * And there is **no chunk divider** — the seam on the gallery is labelled with a post id
 * because that id is an address you can go back to, and here it addresses nothing.
 *
 * What is kept is the part that matters: each chunk keeps its own `<ul>`, so a landing
 * chunk cannot reflow rows already scrolled past.
 */
export function CollectionFeed({
  collectionId,
  initialPosts,
  hasMore: initialHasMore,
}: {
  collectionId: number
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
      const next = await loadMoreCollectionPosts({ collectionId, after: oldest.id })
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
  }, [canLoad, collectionId, oldest])

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
          <CollectionGrid posts={posts} collectionId={collectionId} />
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
