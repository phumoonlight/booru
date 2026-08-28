/** One placeholder row per `<dl>` entry in the Details list. */
const DETAIL_ROWS = 6

/**
 * Mirrors the post page's own structure — the fixed, full-viewport split with the
 * sidebar on the left — so only the image itself is left to arrive. It is framed by
 * the viewport rather than its own ratio, so the placeholder simply fills the frame.
 */
export default function Loading() {
  return (
    <div className="fixed inset-0 flex flex-col lg:flex-row-reverse">
      <div className="flex h-[55dvh] shrink-0 flex-col p-3 lg:h-auto lg:min-h-0 lg:flex-1">
        <div className="min-h-0 flex-1 animate-pulse rounded-lg border border-border bg-surface" />
      </div>

      <aside className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto border-border p-3 lg:w-72 lg:flex-none lg:border-r">
        {/* The header row: wordmark link, then the two prev/next arrows */}
        <div className="flex items-center justify-between gap-2">
          <div className="h-7 w-32 animate-pulse rounded bg-surface" />
          <div className="flex gap-2">
            <div className="size-7 animate-pulse rounded bg-surface" />
            <div className="size-7 animate-pulse rounded bg-surface" />
          </div>
        </div>

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
  )
}
