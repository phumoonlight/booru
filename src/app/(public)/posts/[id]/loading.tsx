import { SearchHeaderSkeleton } from '@/components/search-header'

/** One placeholder row per `<dl>` entry in the Details list. */
const DETAIL_ROWS = 6

/**
 * Mirrors the post page's own structure — header, then the reversed two-column row —
 * so only the image's height is left to settle when the real page arrives. Its aspect
 * ratio can't be known before the row loads; 3:4 is the middle of what a booru holds.
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-4">
      <SearchHeaderSkeleton />

      <div className="flex flex-col gap-5 pt-4 lg:flex-row-reverse lg:items-start">
        <div className="flex flex-col gap-3 lg:flex-1">
          {/* The prev/next arrow row */}
          <div className="size-8 animate-pulse rounded bg-surface" />
          <div className="aspect-3/4 w-full animate-pulse rounded-lg border border-border bg-surface" />
        </div>

        <aside className="flex flex-col gap-5 lg:w-64 lg:shrink-0">
          <section>
            <div className="mb-2 h-5 w-12 animate-pulse rounded bg-surface" />
            <div className="mb-1.5 h-4 w-16 animate-pulse rounded bg-surface" />
            <div className="flex flex-col gap-0.5">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="pointer-fine:h-7 h-9 animate-pulse rounded bg-surface" />
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 h-5 w-14 animate-pulse rounded bg-surface" />
            <div className="flex flex-col gap-1">
              {Array.from({ length: DETAIL_ROWS }, (_, i) => (
                <div key={i} className="h-5 w-full animate-pulse rounded bg-surface" />
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
