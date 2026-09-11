'use client'

import { useEffect } from 'react'
import { claimView } from '@/components/post-view-counter'
import { recordCollectionPostView } from '@/lib/actions/collections'

/**
 * The post page's view counter, pointed at the other table.
 *
 * It shares `claimView` — and so the one-view-per-hour promise and the one
 * `localStorage` map behind it — and differs only in the key's prefix and the action it
 * calls. `collection:` rather than a board name, because collection ids and post ids are
 * two independent sequences: a bare id would let a view of post 12 suppress a view of
 * collection image 12 for the rest of the session.
 *
 * Renders nothing. It exists so a server render, a prefetch or a crawler reaching
 * `generateMetadata` never counts as a view.
 */
export function CollectionViewCounter({ postId }: { postId: number }) {
  useEffect(() => {
    let cancelled = false
    const key = `collection:${postId}`
    // React 19 dev remounts effects; the flag keeps that from double-counting.
    const timer = setTimeout(() => {
      if (!cancelled && claimView(key)) void recordCollectionPostView(postId)
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [postId])

  return null
}
