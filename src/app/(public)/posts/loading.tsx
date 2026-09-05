import { PostGridSkeleton } from '@/components/post-grid'
import { SearchHeaderSkeleton } from '@/components/search-header'

/** Mirrors the listing: header — which now carries the ☰ — the saved shelf, then the grid. */
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
