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
import { searchHref, tagLabel } from '@/lib/search'
import { SITE_NAME } from '@/lib/site'

/** The tag's own page is addressed by id, so a rename can't break an existing link. */
function readId(id: string): number | null {
  const value = Number(id)
  return Number.isInteger(value) && value > 0 ? value : null
}

function readPage(params: Record<string, string | string[] | undefined>) {
  const raw = typeof params.page === 'string' ? Number(params.page) : 1
  return Number.isInteger(raw) && raw > 0 ? raw : 1
}

function href(tagId: number, page: number) {
  return page > 1 ? `/tags/${tagId}?page=${page}` : `/tags/${tagId}`
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<'/tags/[id]'>): Promise<Metadata> {
  const tagId = readId((await params).id)
  if (tagId === null) return { title: 'Tag not found' }
  if (!isSupabaseConfigured()) return { title: 'Tag' }

  const tag = await getTagById(tagId)
  if (!tag) return { title: 'Tag not found', robots: { index: false, follow: false } }

  const page = readPage(await searchParams)
  const suffix = page > 1 ? ` (page ${page})` : ''
  const label = tagLabel(tag.name)
  const title = `${label}${suffix}`
  const description = `${tag.post_count} post${tag.post_count === 1 ? '' : 's'} tagged ${label}.`

  return {
    title,
    description,
    alternates: { canonical: href(tag.id, page) },
    // One tag is a stable, bounded page — unlike an arbitrary search — so page 1 is
    // worth indexing. Deeper pages only repeat it.
    robots: page === 1 ? undefined : { index: false, follow: true },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url: href(tag.id, page),
      title,
      description,
    },
  }
}

export default async function TagPage({ params, searchParams }: PageProps<'/tags/[id]'>) {
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

  const page = readPage(await searchParams)
  const { posts, total, pageCount } = await searchPosts({ query: tag.name, page })

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
            {CATEGORY_LABEL[tag.category]} · {total} post{total === 1 ? '' : 's'}
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
          key={href(tag.id, page)}
          initialPosts={posts}
          query={tag.name}
          page={page}
          hasMore={page < pageCount}
          nextHref={href(tag.id, page + 1)}
        />
      )}
    </div>
  )
}
