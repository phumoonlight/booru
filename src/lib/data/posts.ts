import { cache } from 'react'
import { createClient, type ServerClient } from '@/lib/supabase/server'
import { createAnonClient } from '@/lib/supabase/anon'
import { createAdminClient } from '@/lib/supabase/admin'
import * as write from '@/lib/data/shared'
import { RESTRICTED_RATINGS, type Rating } from '@/lib/search'
import type { Tag } from '@/lib/tags'

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

/** The columns behind `Post`, spelled out so a select can't quietly drift from the type. */
export const POST_COLUMNS =
  'id, md5, file_ext, file_size, width, height, rating, source_url, view_count, created_at'

export type PostPage = {
  posts: Post[]
  /** Whether anything older matched — the feed's "keep going", and nothing more. No
      total: counting the filtered set cost a scan per read, to render a number that
      only a page-number UI ever needed. */
  hasMore: boolean
}

// Browse listings go through searchPosts() in lib/data/search.ts — an empty query
// returns the whole gallery.

/**
 * How many posts the board holds. Counted head-only, so no rows cross the wire —
 * the landing page shows the number and nothing else about them. `rating_counts`
 * would answer in one small read too, but it is derived data that a failed sync can
 * leave behind, and this is the figure the front door quotes.
 */
export async function getPostCount(): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase.from('posts').select('*', { count: 'exact', head: true })
  if (error) throw new Error(`Post count failed: ${error.message}`)
  return count ?? 0
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
export async function getSitemapPosts(limit: number): Promise<Pick<Post, 'id' | 'created_at'>[]> {
  const supabase = createAnonClient()
  const { data } = await supabase
    .from('posts')
    .select('id, created_at')
    .not('rating', 'in', `(${RESTRICTED_RATINGS.join(',')})`)
    .order('id', { ascending: false })
    .limit(limit)
  return data ?? []
}

// ── Writes ─────────────────────────────────────────────────────────────────────
// The write path itself lives in lib/data/shared.ts, which takes its clients rather
// than building them so the desktop uploader can share it. What is left here is the
// web's half of that: the request-scoped session client and the service-role client,
// bound to the same signatures the actions have always called.

export type { PostFields } from '@/lib/data/shared'

/** Rewrites an existing post's rating, source and whole tag set. */
export async function updatePostWithTags(
  postId: number,
  fields: Parameters<typeof write.updatePostWithTags>[3]
): Promise<void> {
  return write.updatePostWithTags(await createClient(), createAdminClient(), postId, fields)
}

/**
 * Deletes a post and recounts what that emptied. Takes the caller's client because the
 * delete action already has one open — see shared.ts for why the row goes before the files.
 */
export async function deletePostRow(
  supabase: ServerClient,
  postId: number,
  rating: string
): Promise<void> {
  return write.deletePostRow(supabase, createAdminClient(), postId, rating)
}

/**
 * Adds one view to a post.
 *
 * This was the `increment_post_view` SQL function until it was moved here. PostgREST
 * cannot send `view_count = view_count + 1`, so the increment is a read and then a
 * write, and the compare-and-swap is what stands in for the atomicity the SQL function
 * had for free: the update only lands while `view_count` is still what was read, and a
 * concurrent view that got there first makes it match no row, so we read again. Three
 * attempts, then the view is dropped — under real contention a lost view costs less
 * than a retry loop holding a request open.
 *
 * The other counters recount rather than increment (lib/data/counters.ts); this one
 * cannot, because `view_count` is not derived from anything — the rows that would
 * define it are never stored.
 *
 * Service role, because the update policy on `posts` requires a signed-in user and an
 * anonymous visitor's view still counts. Nothing but an id reaches this, and
 * `view_count` is the only column written.
 */
export async function incrementPostView(postId: number): Promise<void> {
  const supabase = createAdminClient()

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: current } = await supabase
      .from('posts')
      .select('view_count')
      .eq('id', postId)
      .maybeSingle()
    if (!current) return

    const { data: bumped } = await supabase
      .from('posts')
      .update({ view_count: current.view_count + 1 })
      .eq('id', postId)
      .eq('view_count', current.view_count)
      .select('id')
      .maybeSingle()
    if (bumped) return
  }
}
