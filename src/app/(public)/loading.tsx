import { PostGridSkeleton } from '@/components/post-grid'
import { SearchHeaderSkeleton } from '@/components/search-header'

/** Mirrors the listing's own structure: header, then the sidebar/grid row. */
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <SearchHeaderSkeleton />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Stands in for the TagDrawer: sidebar from lg up, trigger button below it */}
        <div className="hidden lg:block lg:w-56 lg:shrink-0">
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-6 animate-pulse rounded bg-surface" />
            ))}
          </div>
        </div>
        <div className="h-11 w-28 animate-pulse rounded-lg border border-border bg-surface lg:hidden" />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <PostGridSkeleton />
        </div>
      </div>
    </div>
  )
}
