import type { Metadata } from 'next'
import { searchPosts, getTagsForPosts } from '@/lib/data/search'
import { PostGrid } from '@/components/post-grid'
import { Pagination } from '@/components/pagination'
import { SearchHeader } from '@/components/search-header'
import { TagDrawer } from '@/components/tag-drawer'
import { TagList } from '@/components/tag-list'
import { RatingList } from '@/components/rating-list'
import { SetupNotice } from '@/components/setup-notice'
import { getCurrentProfile } from '@/lib/data/profiles'
import { isSupabaseConfigured } from '@/lib/env'
import { isRestricted, parseSearchQuery, searchHref, splitRatings } from '@/lib/search'
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site'

function readParams(params: Record<string, string | string[] | undefined>) {
  const query = typeof params.tags === 'string' ? params.tags.trim() : ''
  const rawPage = typeof params.page === 'string' ? Number(params.page) : 1
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1
  return { query, page }
}

export async function generateMetadata({ searchParams }: PageProps<'/'>): Promise<Metadata> {
  const { query, page } = readParams(await searchParams)
  const suffix = page > 1 ? ` (page ${page})` : ''

  // Tag combinations are unbounded, so only the plain first page is indexable.
  const indexable = !query && page === 1

  return {
    title: query ? `${query}${suffix}` : `Posts${suffix}`,
    description: query ? `Posts tagged ${query}.` : SITE_DESCRIPTION,
    alternates: { canonical: searchHref(query, page) },
    robots: indexable ? undefined : { index: false, follow: true },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url: searchHref(query, page),
      title: query ? `${query}${suffix}` : `Posts${suffix}`,
      description: query ? `Posts tagged ${query}.` : SITE_DESCRIPTION,
    },
  }
}

export default async function HomePage({ searchParams }: PageProps<'/'>) {
  const { query, page } = readParams(await searchParams)

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

  // Signed-in viewers see every rating; anonymous ones get the safe default unless
  // the query names a restricted rating itself.
  const profile = await getCurrentProfile()
  const canUpload = profile !== null
  const allowRestricted = profile !== null

  const { posts, total, pageCount } = await searchPosts({ query, page, allowRestricted })
  // Sidebar/drawer facets describe the posts actually on screen
  const tagEntries = await getTagsForPosts(posts.map((p) => p.id))
  const { include, exclude, ratings, excludeRatings } = splitRatings(parseSearchQuery(query))
  const restrictedHidden = !allowRestricted && !ratings.some(isRestricted)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <SearchHeader query={query} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <TagDrawer label={`Tags (${tagEntries.length})`}>
          <div className="flex flex-col gap-4">
            <section>
              <h2 className="mb-2 text-sm font-semibold">Rating</h2>
              <RatingList
                posts={posts}
                currentQuery={query}
                activeRatings={ratings}
                excludedRatings={excludeRatings}
                restrictedHidden={restrictedHidden}
              />
            </section>
            <section>
              <h2 className="mb-2 text-sm font-semibold">Tags ({tagEntries.length})</h2>
              <TagList entries={tagEntries.slice(0, 50)} currentQuery={query} />
            </section>
          </div>
        </TagDrawer>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-sm text-muted">
              {include.length === 0 && exclude.length === 0 && ratings.length === 0
                ? 'All posts'
                : `Matching ${[...include, ...ratings.map((r) => `rating:${r}`)].join(', ') || 'any'}${
                    exclude.length ? ` without ${exclude.join(', ')}` : ''
                  }`}
            </h1>
            <span className="shrink-0 text-xs text-muted">
              {total} {total === 1 ? 'post' : 'posts'}
            </span>
          </div>

          {posts.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
              {query
                ? 'No posts match that search.'
                : canUpload
                  ? 'No posts yet — use Upload to add the first one.'
                  : 'No posts yet — the first upload will show up here.'}
            </p>
          ) : (
            <PostGrid posts={posts} />
          )}

          <Pagination page={page} pageCount={pageCount} buildHref={(p) => searchHref(query, p)} />
        </div>
      </div>
    </div>
  )
}
