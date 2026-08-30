import type { MetadataRoute } from 'next'
import { getSitemapPosts } from '@/lib/data/posts'
import { isSupabaseConfigured } from '@/lib/env'
import { siteUrl } from '@/lib/site'

// Sitemaps cap at 50k URLs; posts are the only unbounded set here.
const MAX_POSTS = 10_000

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/posts`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/tags`, changeFrequency: 'daily', priority: 0.5 },
  ]

  // Before the Supabase runbook has been run there is nothing to list
  if (!isSupabaseConfigured()) return staticRoutes

  // Explicit posts stay out of the sitemap — same default as anonymous browsing
  const posts = await getSitemapPosts(MAX_POSTS)

  return [
    ...staticRoutes,
    ...posts.map((post) => ({
      url: `${base}/posts/${post.id}`,
      lastModified: new Date(post.created_at),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ]
}
