import type { MetadataRoute } from 'next'
import { getSitemapPosts } from '@/lib/data/posts'
import { getSitemapCollections } from '@/lib/data/collections'
import { collectionHref, collectionsHref } from '@common/collections'
import { isDatabaseConfigured } from '@/lib/db'
import { siteUrl } from '@/config'

// Sitemaps cap at 50k URLs; posts are the only unbounded set here.
const MAX_POSTS = 10_000

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/posts`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}${collectionsHref()}`, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${base}/tags`, changeFrequency: 'daily', priority: 0.5 },
  ]

  // Before the database has been created there is nothing to list
  if (!isDatabaseConfigured()) return staticRoutes

  // R-18 posts stay out of the sitemap — same default as anonymous browsing
  //
  // The collections are the shelves and not what is on them: a shelf is a fixed listing
  // with a name, which is a page worth finding, and an image inside one is a page with no
  // words on it and no tags to describe it. `/ai-posts` is absent for its own reason —
  // a section a visitor has to switch on is not one to arrive at from a search engine.
  const [posts, collections] = await Promise.all([
    getSitemapPosts(MAX_POSTS),
    getSitemapCollections(),
  ])

  return [
    ...staticRoutes,
    ...collections.map((collection) => ({
      url: `${base}${collectionHref(collection.id)}`,
      lastModified: new Date(collection.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...posts.map((post) => ({
      url: `${base}/posts/${post.id}`,
      lastModified: new Date(post.created_at),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ]
}
