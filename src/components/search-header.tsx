import Link from 'next/link'
import { SearchBar } from '@/components/search-bar'
import { NavProgress } from '@/components/nav-progress'
import { SITE_NAME } from '@/lib/site'

/**
 * Sticky top bar — the mobile stand-in for Danbooru's left sidebar search box, and
 * since the bottom tab bar was dropped, the site's only navigation. Rendered per page
 * rather than in the layout because only pages can read searchParams, and the bar has
 * to reflect the active query.
 * Two links, and neither of them is an account: the site has no login, because it has
 * nothing a visitor could do with one. Uploading, editing, deleting and the tag
 * vocabulary all live in the desktop app (`packages/desktop`), which writes with a key
 * compiled into its own bundle. What is left here is a gallery anyone can read.
 * `showSearch` drops the input for pages that are already one fixed listing (a tag's
 * own page) — the nav above it is the part every page still needs.
 */
export function SearchHeader({
  query = '',
  showSearch = true,
}: {
  query?: string
  showSearch?: boolean
}) {
  return (
    <div className="sticky top-0 z-30 -mx-3 border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
      <div className={`flex items-center justify-between gap-3 ${showSearch ? 'mb-2' : ''}`}>
        {/* The wordmark carries the bar — it outsizes the nav links rather than matching
            them. It goes to the gallery, not to `/`: the landing page is a front door,
            and nothing behind it needs a way back to a search box it already has. */}
        <Link href="/posts" className="text-xl font-bold tracking-tight sm:text-2xl hover:underline">
          {SITE_NAME}
          <NavProgress />
        </Link>
        <nav className="flex items-center gap-3">
          <Link href="/tags" className="text-sm text-muted hover:text-foreground">
            🏷️ Tags
            <NavProgress />
          </Link>
          {/* Where the adult tiers are turned on, which is the only thing on this site
              that changes what a listing contains rather than what it is sorted by */}
          <Link href="/settings" className="text-sm text-muted hover:text-foreground">
            ⚙️ Settings
            <NavProgress />
          </Link>
        </nav>
      </div>
      {/* Keyed so navigation (back/forward, tag links) resets the input to the URL */}
      {showSearch && <SearchBar key={query} initialQuery={query} />}
    </div>
  )
}

/**
 * Stand-in for the bar above, matching it box for box so a `loading.tsx` reserves the
 * exact height the real header takes and the page beneath it doesn't jump on hydration.
 * Keep the two in step: same wrapper classes, same line boxes.
 */
export function SearchHeaderSkeleton() {
  return (
    <div className="sticky top-0 z-30 -mx-3 border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-3">
        {/* Matches the wordmark's 1.75rem / sm:2rem line box */}
        <div className="h-7 w-32 animate-pulse rounded bg-surface sm:h-8" />
        <div className="flex items-center gap-3">
          <div className="h-5 w-14 animate-pulse rounded bg-surface" />
          <div className="h-5 w-20 animate-pulse rounded bg-surface" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="h-11 flex-1 animate-pulse rounded-lg border border-border bg-surface" />
        <div className="h-11 w-12 animate-pulse rounded-lg border border-border bg-surface" />
      </div>
    </div>
  )
}
