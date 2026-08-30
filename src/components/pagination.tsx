import Link from 'next/link'
import { NavProgress } from '@/components/nav-progress'

/** Page numbers stay in the URL so pages are linkable and crawlable. */
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

  const window = [page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount)

  const linkClass =
    'flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border px-3 text-sm'

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-2">
      {page > 1 && (
        <Link href={buildHref(page - 1)} className={linkClass} rel="prev">
          Prev
          <NavProgress />
        </Link>
      )}
      {window.map((p) => (
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
        <Link href={buildHref(page + 1)} className={linkClass} rel="next">
          Next
          <NavProgress />
        </Link>
      )}
    </nav>
  )
}
