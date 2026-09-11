import Link from 'next/link'
import type { ReactNode } from 'react'
import { SearchBar } from '@/components/search-bar'
import { NavProgress } from '@/components/nav-progress'
import { BOARD, type Board } from '@common/board'
import { isGenerativeEnabled } from '@/lib/generative-server'
import { SITE_NAME } from '@/config'

/**
 * Sticky top bar — the mobile stand-in for Danbooru's left sidebar search box, and
 * since the bottom tab bar was dropped, the site's only navigation. Rendered per page
 * rather than in the layout because only pages can read searchParams, and the bar has
 * to reflect the active query.
 * Two links, and neither of them is an account: the site has no login, because it has
 * nothing a visitor could do with one. Uploading, editing, deleting and the tag
 * vocabulary all live in the desktop app (`packages/desktop`), which writes with a key
 * compiled into its own bundle. What is left here is a gallery anyone can read.
 * `showSearch` drops the input for pages the post search does not belong on — a tag's
 * own page, which is already one fixed listing, and /tags, which has a filter box of its
 * own and would otherwise offer two boxes with no way to tell which one a tag name goes
 * into. The nav above it is the part every page still needs.
 *
 * **🤖 AI posts appears only once it has been switched on**, which is why this is an
 * async server component: the setting is a cookie, and a nav drawn in the layout could
 * not read the one thing that decides what is in it. It sits ahead of Tags because the
 * two items before it are the two galleries, and Tags is what describes either of them.
 * The wordmark goes back to the board you are reading rather than always to `/posts` —
 * on the AI listing, "home" is that listing.
 */
export async function SearchHeader({
  query = '',
  showSearch = true,
  board = 'post',
  menu,
}: {
  query?: string
  showSearch?: boolean
  /** Which board this page belongs to: where the wordmark goes back to, where the search
      box submits, and which nav item is drawn as the one you are already on. */
  board?: Board
  /**
   * A control at the far left, ahead of the wordmark — the listing's tag drawer, and
   * nothing else so far. A slot rather than the drawer itself, because this file is a
   * server component and the drawer is not: the panel's contents are server-rendered by
   * the page that knows which tags are on screen, and passed down through it.
   */
  menu?: ReactNode
}) {
  // Drawn if the setting is on — or if you are already on it, since a nav that hid the
  // page you are looking at would leave no way back to it but the address bar.
  const showGenerative = board === 'generative' || (await isGenerativeEnabled())

  return (
    <div className="sticky top-0 z-30 -mx-3 border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
      <div className={`flex items-center justify-between gap-3 ${showSearch ? 'mb-2' : ''}`}>
        <div className="flex min-w-0 items-center gap-2">
          {menu}
          {/* The wordmark carries the bar — it outsizes the nav links rather than matching
              them. It goes to the gallery, not to `/`: the landing page is a front door,
              and nothing behind it needs a way back to a search box it already has.

              **The gallery, on either board.** It is the site's name, so it goes to the
              site's main listing wherever it is drawn — pointing it at `/ai-posts` while
              you are there made it a second way of staying put, which is the one thing a
              wordmark should never be. The way back to the AI listing is its own nav item,
              which is beside this and marked as the page you are on. */}
          <Link
            href={BOARD.post.path}
            className="truncate text-xl font-bold tracking-tight sm:text-2xl hover:underline"
          >
            {SITE_NAME}
            <NavProgress />
          </Link>
        </div>
        <nav className="flex items-center gap-3">
          {showGenerative && (
            <Link
              href={BOARD.generative.path}
              aria-current={board === 'generative' ? 'page' : undefined}
              className={`text-sm hover:text-foreground ${
                board === 'generative' ? 'text-foreground' : 'text-muted'
              }`}
            >
              🤖 {BOARD.generative.label}
              <NavProgress />
            </Link>
          )}
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
      {showSearch && <SearchBar key={query} initialQuery={query} board={board} />}
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
        <div className="flex items-center gap-2">
          {/* The 🍔, then the wordmark's own 1.75rem / sm:2rem line box */}
          <div className="pointer-fine:size-8 size-11 animate-pulse rounded-lg bg-surface" />
          <div className="h-7 w-32 animate-pulse rounded bg-surface sm:h-8" />
        </div>
        {/* Two nav items, not three: 🤖 AI posts is behind a cookie the skeleton cannot
            read, and reserving a slot for something usually absent leaves a gap on most
            visits where the point of this file is that nothing moves. */}
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
