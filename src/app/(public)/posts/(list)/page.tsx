import type { Metadata } from 'next'
import { LatestFeed } from '@/components/latest-feed'
import { SetupNotice } from '@/components/setup-notice'
import { SiteHeader } from '@/components/site-header'
import { isDatabaseConfigured } from '@/lib/db'
import { COLLECTION_PAGE_SIZE, listLatestCollectionPosts } from '@/lib/data/collections'
import { SITE_DESCRIPTION, SITE_NAME } from '@/config'

export const metadata: Metadata = {
  title: 'Posts',
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/posts' },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    url: '/posts',
    title: 'Posts',
    description: SITE_DESCRIPTION,
  },
}

/**
 * The newest images across every shelf. It was the gallery — a tag search over the posts
 * table — until every post was moved onto a collection (0012); the address stayed, since it
 * is where the wordmark and every old link go.
 */
export default async function PostsPage() {
  if (!isDatabaseConfigured()) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
        <SiteHeader current="posts" />
        <SetupNotice />
      </div>
    )
  }

  const { posts, hasMore } = await listLatestCollectionPosts({ perPage: COLLECTION_PAGE_SIZE })

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <SiteHeader current="posts" />
      <h1 className="text-lg font-bold tracking-tight">🖼️ Latest</h1>
      {posts.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          Nothing here yet.
        </p>
      ) : (
        <LatestFeed initialPosts={posts} hasMore={hasMore} />
      )}
    </div>
  )
}
