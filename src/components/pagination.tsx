import { Suspense } from 'react'
import Link from 'next/link'
import { NavProgress } from '@/components/nav-progress'
import { PageJump } from '@/components/page-jump'

/** How many numbered pages the bar offers at once, current page included. */
const WINDOW_SIZE = 10

/**
 * The window is WINDOW_SIZE wide and slides so the current page sits in the middle of
 * it, but it clamps to the ends rather than shrinking there: page 1 shows 1–10 and the
 * last page shows the last ten, so the bar is always the same width and the same number
 * of jumps are reachable wherever you are.
 */
function pageWindow(page: number, pageCount: number) {
  const size = Math.min(WINDOW_SIZE, pageCount)
  const start = Math.min(Math.max(1, page - Math.floor((size - 1) / 2)), pageCount - size + 1)
  return Array.from({ length: size }, (_, i) => start + i)
}

/**
 * Page numbers stay in the URL so pages are linkable and crawlable. Prev/Next are the
 * same ⬅️/➡️ the post detail page walks its neighbours with, so the two navigations
 * look like the one control they are; the numbers stay numbers because they name
 * where they go.
 */
export function Pagination({
  page,
  pageCount,
  buildHref,
}: {
  page: number
  pageCount: number
  buildHref: (page: number) => string
}) {
  if (pageCount <= 1) return null

  const windows = pageWindow(page, pageCount)

  const linkClass =
    'flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border px-2 text-sm hover:border-accent'

  const arrowClass = `flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-xl hover:opacity-80`

  return (
    // Ten tap targets overflow 375px, so the row wraps instead of forcing a sideways
    // scroll on the page. The arrows stay with the numbers because they wrap together.
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-center gap-2 gap-y-1"
    >
      {page > 1 && (
        <Link
          href={buildHref(page - 1)}
          title="Previous page"
          aria-label="Previous page"
          className={arrowClass}
          rel="prev"
        >
          <span aria-hidden>⬅️</span>
          <NavProgress />
        </Link>
      )}
      {windows.map((p) => (
        <Link
          key={p}
          href={buildHref(p)}
          aria-current={p === page ? 'page' : undefined}
          className={
            p === page
              ? `${linkClass} border-accent bg-accent font-medium text-background`
              : linkClass
          }
        >
          {p}
          <NavProgress />
        </Link>
      ))}
      {page < pageCount && (
        <Link
          href={buildHref(page + 1)}
          title="Next page"
          aria-label="Next page"
          className={arrowClass}
          rel="next"
        >
          <span aria-hidden>➡️</span>
          <NavProgress />
        </Link>
      )}
      {/* Only worth the clutter once the window can't reach every page anyway. The
          Suspense boundary is what `useSearchParams` asks for in a client child. */}
      {pageCount > WINDOW_SIZE && (
        <Suspense>
          <PageJump page={page} pageCount={pageCount} />
        </Suspense>
      )}
    </nav>
  )
}
