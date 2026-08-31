import type { Metadata } from 'next'
import Link from 'next/link'
import { searchPosts, getTagsForPosts, getRatingCounts } from '@/lib/data/search'
import { PostFeed } from '@/components/post-feed'
import { BookmarkList } from '@/components/bookmark-list'
import { NavProgress } from '@/components/nav-progress'
import { SearchHeader } from '@/components/search-header'
import { TagDrawer } from '@/components/tag-drawer'
import { GroupedTagList } from '@/components/tag-list'
import { RatingList } from '@/components/rating-list'
import { RatingDisplayOptions } from '@/components/rating-display-options'
import { SetupNotice } from '@/components/setup-notice'
import { getCurrentProfile } from '@/lib/data/profiles'
import { isSupabaseConfigured } from '@/lib/env'
import {
  FROM_PARAM,
  parseSearchQuery,
  searchHref,
  SEARCH_PARAM,
  splitRatings,
} from '@/lib/search'
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site'

function readParams(params: Record<string, string | string[] | undefined>) {
  const raw = params[SEARCH_PARAM]
  const query = typeof raw === 'string' ? raw.trim() : ''
  // Where the listing starts — a resumed bookmark, or the crawler following the feed's
  // next link. Nonsense is dropped rather than rejected: the listing then starts at the
  // newest post, which is where it would have started anyway.
  const rawFrom = params[FROM_PARAM]
  const parsedFrom = typeof rawFrom === 'string' ? Number(rawFrom) : NaN
  const from = Number.isInteger(parsedFrom) && parsedFrom > 0 ? parsedFrom : undefined
  return { query, from }
}

export async function generateMetadata({ searchParams }: PageProps<'/posts'>): Promise<Metadata> {
  const { query, from } = readParams(await searchParams)
  const suffix = from !== undefined ? ` (from #${from})` : ''

  // Tag combinations are unbounded, so only the plain listing is indexable — and a
  // resumed cursor is one visitor's slice of the gallery, which is nobody else's page.
  const indexable = !query && from === undefined

  return {
    title: query ? `${query}${suffix}` : `Posts${suffix}`,
    description: query ? `Posts tagged ${query}.` : SITE_DESCRIPTION,
    alternates: { canonical: searchHref(query, from) },
    robots: indexable ? undefined : { index: false, follow: true },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url: searchHref(query, from),
      title: query ? `${query}${suffix}` : `Posts${suffix}`,
      description: query ? `Posts tagged ${query}.` : SITE_DESCRIPTION,
    },
  }
}

export default async function PostsPage({ searchParams }: PageProps<'/posts'>) {
  const { query, from } = readParams(await searchParams)

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-4">
        <SearchHeader query={query} />
        <div className="pt-4">
          <SetupNotice />
        </div>
      </div>
    )
  }

  const profile = await getCurrentProfile()
  const canUpload = profile !== null

  const { posts, hasMore } = await searchPosts({ query, from })
  // Which tags the facets list comes from the posts on screen; both counts are site-wide
  const [tagEntries, ratingCounts] = await Promise.all([
    getTagsForPosts(posts.map((p) => p.id)),
    getRatingCounts(),
  ])
  const { include, exclude, ratings, excludeRatings } = splitRatings(parseSearchQuery(query))

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <SearchHeader query={query} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <TagDrawer label={`Tags (${tagEntries.length})`}>
          <div className="flex flex-col gap-4">
            {/* First, because it is the only thing here that is about *you* rather than
                about what is on screen — and the way back into a browse you left. */}
            <section>
              <h2 className="mb-2 text-base font-semibold">Bookmarks</h2>
              <BookmarkList />
            </section>
            <section className="border-t border-border pt-4">
              <RatingDisplayOptions />
              <RatingList
                counts={ratingCounts}
                currentQuery={query}
                activeRatings={ratings}
                excludedRatings={excludeRatings}
              />
            </section>
            {/* Ruled off from the rating scale above it */}
            <section className="border-t border-border pt-4">
              <h2 className="mb-2 text-base font-semibold">Tags ({tagEntries.length})</h2>
              <GroupedTagList entries={tagEntries.slice(0, 50)} currentQuery={query} />
            </section>
          </div>
        </TagDrawer>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* The grid speaks for itself, so the heading is left for assistive tech only */}
          {from !== undefined && (
            <p className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              <span>🔖 Picking up from post #{from} — older posts follow.</span>
              <Link href={searchHref(query)} className="text-muted underline hover:text-foreground">
                Start from newest
                <NavProgress />
              </Link>
            </p>
          )}

          <h1 className="sr-only">
            {include.length === 0 && exclude.length === 0 && ratings.length === 0
              ? 'All posts'
              : `Matching ${[...include, ...ratings.map((r) => `rating:${r}`)].join(', ') || 'any'}${
                  exclude.length ? ` without ${exclude.join(', ')}` : ''
                }`}
          </h1>

          {posts.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
              {query
                ? 'No posts match that search.'
                : canUpload
                  ? 'No posts yet — use Upload to add the first one.'
                  : 'No posts yet — the first upload will show up here.'}
            </p>
          ) : (
            <PostFeed
              // A new search is a new feed, not more of the old one: the key throws the
              // appended chunks away rather than letting them outlive their query.
              key={searchHref(query, from)}
              initialPosts={posts}
              query={query}
              hasMore={hasMore}
              // Ids are integers, so one below the oldest post on screen is exactly
              // "everything older than this" — the chain a crawler follows.
              nextHref={searchHref(query, posts[posts.length - 1].id - 1)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
