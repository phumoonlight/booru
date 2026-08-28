import Link from 'next/link'
import { SearchBar } from '@/components/search-bar'
import { logout } from '@/lib/actions/auth'
import { getCurrentProfile } from '@/lib/data/profiles'
import { isSupabaseConfigured } from '@/lib/env'
import { SITE_NAME } from '@/lib/site'

/**
 * Sticky top bar — the mobile stand-in for Danbooru's left sidebar search box, and
 * since the bottom tab bar was dropped, the site's only navigation. Rendered per page
 * rather than in the layout because only pages can read searchParams, and the bar has
 * to reflect the active query.
 * Signed-in users also get the link to /upload here, so it is reachable from every page.
 */
export async function SearchHeader({ query = '' }: { query?: string }) {
  const profile = isSupabaseConfigured() ? await getCurrentProfile() : null

  return (
    <div className="sticky top-0 z-30 -mx-3 border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-3">
        {/* The wordmark carries the bar — it outsizes the nav links rather than matching them */}
        <Link href="/" className="text-xl font-bold tracking-tight sm:text-2xl hover:underline">
          {SITE_NAME}
        </Link>
        <nav className="flex items-center gap-3">
          <Link href="/tags" className="text-sm text-muted hover:text-foreground">
            🏷️ Tags
          </Link>
          {profile && (
            <Link href="/upload" className="text-sm text-muted hover:text-foreground">
              ⬆️ Upload
            </Link>
          )}
          {profile ? (
            <form action={logout}>
              <button type="submit" className="text-sm text-muted hover:text-foreground">
                👋 Log out
              </button>
            </form>
          ) : (
            <Link href="/login" className="text-sm text-muted hover:text-foreground">
              🔑 Log in
            </Link>
          )}
        </nav>
      </div>
      {/* Keyed so navigation (back/forward, tag links) resets the input to the URL */}
      <SearchBar key={query} initialQuery={query} />
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
          <div className="h-5 w-16 animate-pulse rounded bg-surface" />
          <div className="h-5 w-16 animate-pulse rounded bg-surface" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="h-11 flex-1 animate-pulse rounded-lg border border-border bg-surface" />
        <div className="h-11 w-12 animate-pulse rounded-lg bg-surface" />
      </div>
    </div>
  )
}
