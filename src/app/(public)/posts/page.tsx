import type { Metadata } from 'next'
import Link from 'next/link'
import { searchPosts, getTagsForPosts, FEED_CHUNK_SIZE } from '@/lib/data/search'
import { NavProgress } from '@/components/nav-progress'
import { PostFeed } from '@/components/post-feed'
import { SavedQueries } from '@/components/saved-queries'
import { SearchHeader } from '@/components/search-header'
import { TagDrawer } from '@/components/tag-drawer'
import { GroupedTagList } from '@/components/tag-list'
import { SetupNotice } from '@/components/setup-notice'
import { isSupabaseConfigured } from '@/lib/env'
import { isNsfwEnabled } from '@/lib/nsfw-server'
import { isRestricted, parseSearchQuery, searchHref, SEARCH_PARAM, splitQuery } from '@common/search'
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

  const { posts, hasMore } = await searchPosts({ query })
  // Which tags the facet lists comes from the posts on screen; their counts are site-wide
  const tagEntries = await getTagsForPosts(posts.map((p) => p.id))
  const { include, exclude, ratings } = splitQuery(parseSearchQuery(query))
  // A rating this browser isn't listing can still be typed into the box. Nothing comes
  // back, and an empty grid is an honest but unhelpful answer on its own — the reason is
  // a setting, and the setting is one click away.
  const askedForHidden = !(await isNsfwEnabled()) && ratings.some(isRestricted)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <SearchHeader
        query={query}
        menu={
          <TagDrawer label={`Tags (${tagEntries.length})`}>
            <h2 className="mb-2 text-base font-semibold">Tags ({tagEntries.length})</h2>
            <GroupedTagList entries={tagEntries.slice(0, 50)} currentQuery={query} />
          </TagDrawer>
        }
      />

      {/* What is left of the row the drawer used to share: the one thing here about *you*
          rather than about what is on screen, and the way back into a browse you left. */}
      <SavedQueries currentQuery={query} />

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

      {askedForHidden && (
        <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
          That search asks for a rating this browser isn&rsquo;t showing.{' '}
          <Link href="/settings" className="text-accent hover:underline">
            Enable NSFW in Settings
            <NavProgress />
          </Link>{' '}
          to include it.
        </p>
      )}

      {posts.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {query ? 'No posts match that search.' : 'No posts yet — the desktop app adds the first one.'}
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
  )
}
