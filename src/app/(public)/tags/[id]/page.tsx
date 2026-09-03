import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getTagById } from '@/lib/data/tags'
import { searchPosts } from '@/lib/data/search'
import { PostFeed } from '@/components/post-feed'
import { SearchHeader } from '@/components/search-header'
import { SetupNotice } from '@/components/setup-notice'
import { NavProgress } from '@/components/nav-progress'
import { CATEGORY_COLOR, CATEGORY_LABEL } from '@/components/tag-list'
import { isSupabaseConfigured } from '@/lib/env'
import { searchHref, tagLabel } from '@common/search'
import { SITE_NAME } from '@/lib/site'

/** The tag's own page is addressed by id, so a rename can't break an existing link. */
function readId(id: string): number | null {
  const value = Number(id)
  return Number.isInteger(value) && value > 0 ? value : null
}

/**
 * A sample, not a listing. This page exists to show what a tag looks like and hand you
 * to the gallery — so it opens with ten posts, grows to fifty if you ask, and then
 * stops: browsing a tag to its end is what `/posts?query=<tag>` is for, and that page
 * has the search bar, the facets and the cursor this one deliberately drops.
 */
const SAMPLE_SIZE = 10
const SAMPLE_LIMIT = 50

export async function generateMetadata({ params }: PageProps<'/tags/[id]'>): Promise<Metadata> {
  const tagId = readId((await params).id)
  if (tagId === null) return { title: 'Tag not found' }
  if (!isSupabaseConfigured()) return { title: 'Tag' }

  const tag = await getTagById(tagId)
  if (!tag) return { title: 'Tag not found', robots: { index: false, follow: false } }

  const label = tagLabel(tag.name)
  const title = label
  const description = `${tag.post_count} post${tag.post_count === 1 ? '' : 's'} tagged ${label}.`

  return {
    title,
    description,
    alternates: { canonical: `/tags/${tag.id}` },
    // One tag is a stable, bounded page — unlike an arbitrary search — and there is only
    // ever the one of it now, so nothing here needs holding back from an index.
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url: `/tags/${tag.id}`,
      title,
      description,
    },
  }
}

export default async function TagPage({ params }: PageProps<'/tags/[id]'>) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-4">
        <SearchHeader showSearch={false} />
        <div className="pt-4">
          <SetupNotice />
        </div>
      </div>
    )
  }

  const tagId = readId((await params).id)
  if (tagId === null) notFound()

  const tag = await getTagById(tagId)
  if (!tag) notFound()

  const { posts, hasMore } = await searchPosts({ query: tag.name, perPage: SAMPLE_SIZE })

  return (
    // `data-no-blur` turns the rating blur off for everything below it (globals.css).
    // Arriving here is already a choice of one tag, so there is nothing left to warn
    // about the way a mixed gallery does.
    <div data-no-blur className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      {/* No search box and no tag drawer: this page is one tag, and both controls exist
          to narrow across many. The gallery keeps them. */}
      <SearchHeader showSearch={false} />

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-2">
          <h1 className={`text-lg font-bold tracking-tight ${CATEGORY_COLOR[tag.category]}`}>
            {tagLabel(tag.name)}
          </h1>
          <span className="text-xs uppercase tracking-wide text-muted">
            {CATEGORY_LABEL[tag.category]} · {tag.post_count} post
            {tag.post_count === 1 ? '' : 's'}
          </span>
        </div>
        {/* The way back to the controls this page drops — same tag, in the gallery */}
        <Link href={searchHref(tag.name)} className="text-sm text-muted hover:text-foreground">
          🖼️ View in posts
          <NavProgress />
        </Link>
      </div>

      {posts.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          No posts carry this tag.
        </p>
      ) : (
        <PostFeed
          initialPosts={posts}
          query={tag.name}
          hasMore={hasMore}
          perPage={SAMPLE_SIZE}
          limit={SAMPLE_LIMIT}
          moreHref={searchHref(tag.name)}
          moreLabel="🖼️ View all in posts"
        />
      )}
    </div>
  )
}
