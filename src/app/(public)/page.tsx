import type { Metadata } from 'next'
import { searchPosts, getTagsForPosts } from '@/lib/data/search'
import { PostGrid } from '@/components/post-grid'
import { Pagination } from '@/components/pagination'
import { SearchHeader } from '@/components/search-header'
import { TagDrawer } from '@/components/tag-drawer'
import { TagList } from '@/components/tag-list'
import { SetupNotice } from '@/components/setup-notice'
import { isSupabaseConfigured } from '@/lib/env'
import { parseSearchQuery, searchHref } from '@/lib/search'

export const metadata: Metadata = {
  title: 'Posts — Booru',
}

export default async function HomePage({ searchParams }: PageProps<'/'>) {
  const params = await searchParams
  const query = typeof params.tags === 'string' ? params.tags.trim() : ''

  const rawPage = typeof params.page === 'string' ? Number(params.page) : 1
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1

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

  const { posts, total, pageCount } = await searchPosts({ query, page })
  // Sidebar/drawer facets describe the posts actually on screen
  const tagEntries = await getTagsForPosts(posts.map((p) => p.id))
  const { include, exclude } = parseSearchQuery(query)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <SearchHeader query={query} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <TagDrawer count={tagEntries.length}>
          <TagList entries={tagEntries.slice(0, 50)} currentQuery={query} />
        </TagDrawer>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-sm text-muted">
              {include.length === 0 && exclude.length === 0
                ? 'All posts'
                : `Matching ${include.join(', ') || 'any'}${
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
