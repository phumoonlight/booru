import type { Metadata } from 'next'
import {
  searchPosts,
  getTagsForPosts,
  getRatingCounts,
  FEED_CHUNK_SIZE,
} from '@/lib/data/search'
import { PostFeed } from '@/components/post-feed'
import { SavedQueries } from '@/components/saved-queries'
import { SearchHeader } from '@/components/search-header'
import { TagDrawer } from '@/components/tag-drawer'
import { GroupedTagList } from '@/components/tag-list'
import { RatingList } from '@/components/rating-list'
import { RatingDisplayOptions } from '@/components/rating-display-options'
import { SetupNotice } from '@/components/setup-notice'
import { getCurrentProfile } from '@/lib/data/profiles'
import { isSupabaseConfigured } from '@/lib/env'
import { parseSearchQuery, searchHref, SEARCH_PARAM, splitQuery } from '@/lib/search'
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site'

/** The whole address of a listing is one string — tags, ratings and the `start:`
    cursor together — so there is only ever this one param to read. */
function readQuery(params: Record<string, string | string[] | undefined>) {
  const raw = params[SEARCH_PARAM]
  return typeof raw === 'string' ? raw.trim() : ''
}

export async function generateMetadata({ searchParams }: PageProps<'/posts'>): Promise<Metadata> {
  const query = readQuery(await searchParams)

  // Tag combinations are unbounded, so only the plain listing is indexable — and a
  // query carrying a cursor is one visitor's slice of it, which is nobody else's page.
  const indexable = !query

  return {
    title: query ? query : 'Posts',
    description: query ? `Posts tagged ${query}.` : SITE_DESCRIPTION,
    alternates: { canonical: searchHref(query) },
    robots: indexable ? undefined : { index: false, follow: true },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url: searchHref(query),
      title: query ? query : 'Posts',
      description: query ? `Posts tagged ${query}.` : SITE_DESCRIPTION,
    },
  }
}

export default async function PostsPage({ searchParams }: PageProps<'/posts'>) {
  const query = readQuery(await searchParams)

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

  const { posts, hasMore } = await searchPosts({ query })
  // Which tags the facets list comes from the posts on screen; both counts are site-wide
  const [tagEntries, ratingCounts] = await Promise.all([
    getTagsForPosts(posts.map((p) => p.id)),
    getRatingCounts(),
  ])
  const { include, exclude, ratings, excludeRatings } = splitQuery(parseSearchQuery(query))

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <SearchHeader query={query} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <TagDrawer label={`Tags (${tagEntries.length})`}>
          <div className="flex flex-col gap-4">
            {/* First, because it is the only thing here that is about *you* rather than
                about what is on screen — and the way back into a browse you left. */}
            <section>
              <SavedQueries currentQuery={query} />
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
          {/* No banner for a resumed cursor: `start:900` is a chip in the search bar
              like any other token, and tapping its ✕ is how you leave it behind. */}
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
              key={searchHref(query)}
              initialPosts={posts}
              query={query}
              hasMore={hasMore}
              perPage={FEED_CHUNK_SIZE}
              resumable
            />
          )}
        </div>
      </div>
    </div>
  )
}
