import { PostGridSkeleton } from '@/components/post-grid'
import { SearchHeaderSkeleton } from '@/components/search-header'

/**
 * Mirrors the listing: header — which now carries the 🍔 — the saved shelf, then the grid.
 *
 * It is inside `(list)` so that it stands in for the listing and nothing else. At
 * `posts/` it was the nearest boundary above `posts/[id]` too, so walking from one post
 * to the next tore the page down to a grid skeleton and built it back: the header
 * flickered, the picture went, and what came back was the same layout with two fields
 * changed. A post page has no fallback of its own now — with no boundary between it and
 * the root, the router holds the post you are looking at until the next one is ready,
 * which is the difference between a blink and a wait.
 */
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <SearchHeaderSkeleton />

      {/* Stands in for the saved-query shelf, which is a row of chips of its own width */}
      <div className="h-9 w-40 animate-pulse rounded-lg bg-surface" />

      <PostGridSkeleton />
    </div>
  )
}
