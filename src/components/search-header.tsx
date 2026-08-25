import Link from 'next/link'
import { SearchBar } from '@/components/search-bar'

/**
 * Sticky top bar — the mobile stand-in for Danbooru's left sidebar search box.
 * Rendered per page rather than in the layout because only pages can read
 * searchParams, and the bar has to reflect the active query.
 */
export function SearchHeader({ query = '' }: { query?: string }) {
  return (
    <div className="sticky top-0 z-30 -mx-3 border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-3">
        <Link href="/" className="text-base font-bold tracking-tight">
          Booru
        </Link>
        <Link href="/tags" className="text-sm text-muted hover:text-foreground">
          Browse tags
        </Link>
      </div>
      {/* Keyed so navigation (back/forward, tag links) resets the input to the URL */}
      <SearchBar key={query} initialQuery={query} />
    </div>
  )
}
