import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { NavProgress } from '@/components/nav-progress'
import { SetupNotice } from '@/components/setup-notice'
import { countCollectionPosts } from '@/lib/data/collections'
import { isDatabaseConfigured } from '@/lib/db'
import { emojiNumber } from '@/lib/emoji-number'
import { collectionsHref } from '@common/collections'
import { SITE_DESCRIPTION, SITE_NAME } from '@/config'

export const metadata: Metadata = {
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
}

const DOOR =
  'flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-5 text-sm transition-colors hover:border-accent'

/**
 * The front door: the wordmark, the two ways in, and how many images are behind them.
 *
 * It was a search box until the boards were dropped (0012). There is no site-wide search
 * to put here now — the shelf list's own is one click in — so the door is the two places a
 * visit starts: the newest images, or the shelves.
 */
export default async function HomePage() {
  // Rendered per request. It read `searchParams` while it was a search box, which made it
  // dynamic for free; with nothing request-shaped left, the count and the maintenance switch
  // in the layout above would otherwise be frozen at whatever the build saw.
  await connection()

  const configured = isDatabaseConfigured()
  const postCount = configured ? await countCollectionPosts() : 0

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 px-3 py-16 text-center sm:py-24">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{SITE_NAME}</h1>

      <nav className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/posts" className={DOOR}>
          <span aria-hidden>🖼️</span> Latest
          <NavProgress />
        </Link>
        <Link href={collectionsHref()} className={DOOR}>
          <span aria-hidden>🗂️</span> Collections
          <NavProgress />
        </Link>
      </nav>

      {configured ? (
        <p className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted">
          <span>Serving</span>
          {/* The keycaps are decoration; the plain number is what gets announced */}
          <span
            aria-label={`${postCount.toLocaleString('en-US')} images`}
            className="text-base tracking-tight"
          >
            <span aria-hidden>{emojiNumber(postCount)}</span>
          </span>
          <span>images</span>
        </p>
      ) : (
        <div className="w-full text-left">
          <SetupNotice />
        </div>
      )}

      <Link href="/settings" className="text-sm text-muted hover:text-foreground hover:underline">
        Settings
        <NavProgress />
      </Link>
    </div>
  )
}
