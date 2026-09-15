import Link from 'next/link'
import { NavProgress } from '@/components/nav-progress'
import { collectionsHref } from '@common/collections'
import { SITE_NAME } from '@/config'

/** Which nav item is the page you are on. */
export type Section = 'posts' | 'collections' | 'settings'

const ITEMS: { section: Section; href: string; label: string }[] = [
  { section: 'posts', href: '/posts', label: '🖼️ Posts' },
  { section: 'collections', href: collectionsHref(), label: '🗂️ Collections' },
  { section: 'settings', href: '/settings', label: '⚙️ Settings' },
]

/**
 * Sticky top bar, and the site's only navigation: the wordmark and three items.
 *
 * It carried the tag search until the boards were dropped (0012) — a box on every listing,
 * a 🍔 for the tag drawer, and a cookie-gated 🤖 AI posts item. What is left is where to
 * go: the newest images, the shelves, and the one setting. The shelf list's own search is
 * on that page, since it is a search of shelves and nothing else on the site is.
 *
 * None of the links is an account: the site has no login, because it has nothing a visitor
 * could do with one. Everything that changes the board lives in the desktop app.
 */
export function SiteHeader({ current }: { current?: Section }) {
  return (
    <div className="sticky top-0 z-30 -mx-3 border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        {/* The wordmark goes to `/posts`, not `/`: the landing page is a front door, and
            nothing behind it needs a way back to it. */}
        <Link
          href="/posts"
          className="min-w-0 truncate text-xl font-bold tracking-tight sm:text-2xl hover:underline"
        >
          {SITE_NAME}
          <NavProgress />
        </Link>
        <nav className="flex items-center gap-3">
          {ITEMS.map((item) => (
            <Link
              key={item.section}
              href={item.href}
              aria-current={current === item.section ? 'page' : undefined}
              className={`text-sm hover:text-foreground ${
                current === item.section ? 'text-foreground' : 'text-muted'
              }`}
            >
              {item.label}
              <NavProgress />
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}

/**
 * Stand-in for the bar above, matching it box for box so a `loading.tsx` reserves the
 * exact height the real header takes and the page beneath it doesn't jump on hydration.
 * Keep the two in step: same wrapper classes, same line boxes.
 */
export function SiteHeaderSkeleton() {
  return (
    <div className="sticky top-0 z-30 -mx-3 border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        {/* The wordmark's own 1.75rem / sm:2rem line box */}
        <div className="h-7 w-32 animate-pulse rounded bg-surface sm:h-8" />
        <div className="flex items-center gap-3">
          <div className="h-5 w-16 animate-pulse rounded bg-surface" />
          <div className="h-5 w-24 animate-pulse rounded bg-surface" />
          <div className="h-5 w-20 animate-pulse rounded bg-surface" />
        </div>
      </div>
    </div>
  )
}
