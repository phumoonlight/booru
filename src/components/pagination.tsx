import Link from 'next/link'
import { NavProgress } from '@/components/nav-progress'

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

  const windows = [page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount)

  const linkClass =
    'flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border px-2 text-sm hover:border-accent'

  const arrowClass = `flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-xl`

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-2">
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
    </nav>
  )
}
