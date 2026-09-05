import type { BooruClient } from '@common/supabase/types'
import { RESTRICTED_RATINGS, type Rating } from '@common/search'
import type { Tag } from '@common/tags'

/**
 * Post reads, shared by both front ends. These moved out of the website's
 * `src/lib/data/posts.ts` when the desktop app took over managing posts: it needs to
 * load the post it is about to edit, and a second copy of the row shape is how the two
 * quietly disagree about what a post is.
 *
 * Like everything else in this directory they take their client rather than building
 * one. The web wraps them with `cache()` where a request reads the same row twice; that
 * is a React concern and stays on the web's side.
 */

export type Post = {
  id: number
  file_name: string
  file_ext: string
  file_size: number
  width: number
  height: number
  rating: Rating
  source_url: string | null
  view_count: number
  created_at: string
}

/** The columns behind `Post`, spelled out so a select can't quietly drift from the type. */
export const POST_COLUMNS =
  'id, file_name, file_ext, file_size, width, height, rating, source_url, view_count, created_at'

export type PostPage = {
  posts: Post[]
  /** Whether anything older matched — the feed's "keep going", and nothing more. No
      total: counting the filtered set cost a scan per read, to render a number that
      only a page-number UI ever needed. */
  hasMore: boolean
}

/** How many posts the board holds. Head-only, so no rows cross the wire. */
export async function getPostCount(client: BooruClient): Promise<number> {
  const { count, error } = await client.from('posts').select('*', { count: 'exact', head: true })
  if (error) throw new Error(`Post count failed: ${error.message}`)
  return count ?? 0
}

export async function getPost(client: BooruClient, id: number): Promise<Post | null> {
  const { data } = await client.from('posts').select(POST_COLUMNS).eq('id', id).maybeSingle()
  return (data as Post | null) ?? null
}

export async function getPostTags(client: BooruClient, postId: number): Promise<Tag[]> {
  const { data } = await client
    .from('post_tags')
    .select('tags(id, name, category, emoji, post_count)')
    .eq('post_id', postId)

  return (data ?? [])
    .flatMap((row) => (row.tags ? [row.tags as unknown as Tag] : []))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Adjacent post ids for prev/next navigation on the detail page. */
export async function getPostNeighbours(
  client: BooruClient,
  id: number
): Promise<{ prevId: number | null; nextId: number | null }> {
  const [older, newer] = await Promise.all([
    client
      .from('posts')
      .select('id')
      .lt('id', id)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
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
 * Ids + dates of indexable posts, newest first — the sitemap's source. Drops the
 * restricted tiers to match what a search engine is shown.
 */
export async function getSitemapPosts(
  client: BooruClient,
  limit: number
): Promise<Pick<Post, 'id' | 'created_at'>[]> {
  const { data } = await client
    .from('posts')
    .select('id, created_at')
    .not('rating', 'in', `(${RESTRICTED_RATINGS.join(',')})`)
    .order('id', { ascending: false })
    .limit(limit)
  return (data as Pick<Post, 'id' | 'created_at'>[] | null) ?? []
}
