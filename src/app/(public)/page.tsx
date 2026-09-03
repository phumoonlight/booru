import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SearchBar } from '@/components/search-bar'
import { NavProgress } from '@/components/nav-progress'
import { SetupNotice } from '@/components/setup-notice'
import { getPostCount } from '@/lib/data/posts'
import { isSupabaseConfigured } from '@/lib/env'
import { emojiNumber } from '@/lib/emoji-number'
import { searchHref, SEARCH_PARAM } from '@common/search'
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site'

export const metadata: Metadata = {
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
}

export default async function HomePage({ searchParams }: PageProps<'/'>) {
  const params = await searchParams
  // `/?query=…` was the gallery's own URL before the split — old links and bookmarks
  // (and anything a crawler already holds) land here, so hand them on rather than
  // silently dropping the search.
  const legacy = params[SEARCH_PARAM]
  if (typeof legacy === 'string' && legacy.trim()) redirect(searchHref(legacy))

  const configured = isSupabaseConfigured()
  const postCount = configured ? await getPostCount() : 0

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 px-3 py-16 text-center sm:py-24">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{SITE_NAME}</h1>

      {/* The front door is the search box — the same one the gallery carries, so a
          query typed here lands on /posts already parsed. */}
      <div className="w-full text-left">
        <SearchBar showChips={false} />
      </div>

      {/* Two links only — upload and the account live in the header of every page
          behind them, and the front door is meant to stay a search box. */}
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
        <Link href="/posts" className="text-muted hover:text-foreground hover:underline">
          Posts
          <NavProgress />
        </Link>
        <Link href="/tags" className="text-muted hover:text-foreground hover:underline">
          Tags
          <NavProgress />
        </Link>
      </nav>

      {configured ? (
        <p className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted">
          <span>Serving</span>
          {/* The keycaps are decoration; the plain number is what gets announced */}
          <span
            aria-label={`${postCount.toLocaleString('en-US')} posts`}
            className="text-base tracking-tight"
          >
            <span aria-hidden>{emojiNumber(postCount)}</span>
          </span>
          <span>posts</span>
        </p>
      ) : (
        <div className="w-full text-left">
          <SetupNotice />
        </div>
      )}
    </div>
  )
}
