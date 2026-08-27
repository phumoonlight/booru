import Link from 'next/link'
import type { ReactNode } from 'react'
import { SearchBar } from '@/components/search-bar'
import { logout } from '@/lib/actions/auth'
import { getCurrentProfile } from '@/lib/data/profiles'
import { isSupabaseConfigured } from '@/lib/env'

/**
 * Sticky top bar — the mobile stand-in for Danbooru's left sidebar search box, and
 * since the bottom tab bar was dropped, the site's only navigation. Rendered per page
 * rather than in the layout because only pages can read searchParams, and the bar has
 * to reflect the active query.
 * `actions` is the slot for page-level controls (the admin upload button).
 */
export async function SearchHeader({
  query = '',
  actions,
}: {
  query?: string
  actions?: ReactNode
}) {
  const profile = isSupabaseConfigured() ? await getCurrentProfile() : null

  return (
    <div className="sticky top-0 z-30 -mx-3 border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-3">
        <Link href="/" className="text-base font-bold tracking-tight">
          Booru
        </Link>
        <nav className="flex items-center gap-3">
          <Link href="/tags" className="text-sm text-muted hover:text-foreground">
            Tags
          </Link>
          {profile ? (
            <form action={logout}>
              <button type="submit" className="text-sm text-muted hover:text-foreground">
                Log out
              </button>
            </form>
          ) : (
            <Link href="/login" className="text-sm text-muted hover:text-foreground">
              Log in
            </Link>
          )}
          {actions}
        </nav>
      </div>
      {/* Keyed so navigation (back/forward, tag links) resets the input to the URL */}
      <SearchBar key={query} initialQuery={query} />
    </div>
  )
}
