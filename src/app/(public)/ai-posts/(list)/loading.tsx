import { PostGridSkeleton } from '@/components/post-grid'
import { SearchHeaderSkeleton } from '@/components/search-header'

/**
 * The gallery's own `loading.tsx`, for the other board — same header, same shelf, same
 * grid, because it is the same page. It is inside `(list)` for the reason that one is:
 * at `ai-posts/` it would be the nearest boundary above `ai-posts/[id]` as well, so
 * walking from one post to the next would tear the page down to a skeleton and build it
 * back with two fields changed.
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
