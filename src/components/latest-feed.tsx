'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import type { CollectionPost } from '@/lib/data/collections'
import { CollectionGrid } from '@/components/collection-grid'
import { NavProgress } from '@/components/nav-progress'
import { loadMoreLatestPosts } from '@/lib/actions/collections'
import { LATEST_POSTS_LIMIT } from '@/lib/latest-posts'
import { collectionsHref } from '@common/collections'

const BUTTON =
  'flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-6 text-sm transition-colors hover:border-accent'

/**
 * `/posts`: the newest images across every shelf, the server's screenful first and then a
 * chunk per press.
 *
 * **A button, never a scroll.** The gallery this replaced loaded on the way down, which
 * suited a search you were working through; this is a front page with a hundred-image
 * horizon (`LATEST_POSTS_LIMIT`), and a feed that grows under the scroll is a feed that
 * reaches its end without anybody having asked it to. At the limit the button becomes a
 * link to the shelf list, which is where the rest can be found rather than scrolled past.
 *
 * Each chunk keeps its own `<ul>`, as every feed on this site does, so a landing chunk
 * cannot reflow rows already on screen.
 */
export function LatestFeed({
  initialPosts,
  hasMore: initialHasMore,
}: {
  initialPosts: CollectionPost[]
  hasMore: boolean
}) {
  const [chunks, setChunks] = useState<CollectionPost[][]>([initialPosts])
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  const loaded = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const oldest = chunks[chunks.length - 1]?.at(-1)
  const atLimit = loaded >= LATEST_POSTS_LIMIT

  async function load() {
    if (pending || !oldest) return
    setPending(true)
    setFailed(false)
    try {
      const next = await loadMoreLatestPosts({ after: oldest.id, loaded })
      setHasMore(next.hasMore)
      if (next.posts.length > 0) setChunks((current) => [...current, next.posts])
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      {chunks.map((posts, index) => (
        <Fragment key={posts[0]?.id ?? index}>
          <CollectionGrid posts={posts} />
        </Fragment>
      ))}

      <div className="flex flex-col items-center gap-2 py-2">
        {hasMore && !atLimit ? (
          <button type="button" onClick={load} aria-busy={pending} className={BUTTON}>
            {pending ? 'Loading…' : failed ? 'Failed to load — try again' : 'Load more'}
          </button>
        ) : (
          // Drawn at the end as well as at the limit: the last image on the board is the
          // same moment to point somewhere else.
          <Link href={collectionsHref()} className={BUTTON}>
            <span aria-hidden className="mr-1.5">
              🗂️
            </span>
            Explore more in Collections
            <NavProgress />
          </Link>
        )}
      </div>
    </>
  )
}
