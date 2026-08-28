import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAnonClient } from '@/lib/supabase/anon'
import type { Tag } from '@/lib/data/tags'
import { RESTRICTED_RATINGS, type Rating } from '@/lib/search'

export type Post = {
  id: number
  md5: string
  file_ext: string
  file_size: number
  width: number
  height: number
  rating: Rating
  source_url: string | null
  view_count: number
  created_at: string
}

export type PostPage = {
  posts: Post[]
  total: number
  page: number
  pageCount: number
}

// Browse listings go through searchPosts() in lib/data/search.ts — an empty query
// returns the whole gallery.

export async function getPostByMd5(md5: string): Promise<Post | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('posts').select('*').eq('md5', md5).maybeSingle()
  return data
}

// Cached because the post page and its generateMetadata both need the same rows
export const getPost = cache(async (id: number): Promise<Post | null> => {
  const supabase = await createClient()
  const { data } = await supabase.from('posts').select('*').eq('id', id).maybeSingle()
  return data
})

export const getPostTags = cache(async (postId: number): Promise<Tag[]> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('post_tags')
    .select('tags(id, name, category, post_count)')
    .eq('post_id', postId)

  return (data ?? [])
    .flatMap((row) => (row.tags ? [row.tags as unknown as Tag] : []))
    .sort((a, b) => a.name.localeCompare(b.name))
})

export async function getPostTagNames(postId: number): Promise<string[]> {
  const tags = await getPostTags(postId)
  return tags.map((t) => t.name)
}

/** Adjacent post ids for prev/next navigation on the detail page. */
export async function getPostNeighbours(
  id: number
): Promise<{ prevId: number | null; nextId: number | null }> {
  const supabase = await createClient()
  const [older, newer] = await Promise.all([
    supabase
      .from('posts')
      .select('id')
      .lt('id', id)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('posts')
      .select('id')
      .gt('id', id)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])
  return { prevId: newer.data?.id ?? null, nextId: older.data?.id ?? null }
}

/**
 * Ids + dates of indexable posts, newest first — the sitemap's source.
 * Uses the cookie-less client so the route stays cacheable, and drops the
 * restricted tiers to match what an anonymous visitor is shown.
 */
export async function getSitemapPosts(
  limit: number
): Promise<Pick<Post, 'id' | 'created_at'>[]> {
  const supabase = createAnonClient()
  const { data } = await supabase
    .from('posts')
    .select('id, created_at')
    .not('rating', 'in', `(${RESTRICTED_RATINGS.join(',')})`)
    .order('id', { ascending: false })
    .limit(limit)
  return data ?? []
}
