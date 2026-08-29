import { cache } from 'react'
import { createClient, type ServerClient } from '@/lib/supabase/server'
import { createAnonClient } from '@/lib/supabase/anon'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureTagIds } from '@/lib/data/tags'
import type { Tag } from '@/lib/tags'
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

/** The columns behind `Post`, spelled out so a select can't quietly drift from the type. */
export const POST_COLUMNS =
  'id, md5, file_ext, file_size, width, height, rating, source_url, view_count, created_at'

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
// These replace the create_post_with_tags / update_post_with_tags SQL functions.
// Each step is now a request you can see, log and re-run on its own; what is lost is
// the single transaction the functions ran in, so the create path undoes its own work
// (see below) and every failure carries the message of the step that produced it.

export type PostFields = {
  md5: string
  file_ext: string
  file_size: number
  width: number
  height: number
  rating: Rating
  /** Empty string means "no source" — it is stored as null. */
  source_url: string
  tags: string[]
}

/**
 * Inserts a post and its tag links, returning the new id. Runs on the caller's
 * session so RLS records the uploader; pass the signed-in profile's id.
 *
 * If tagging fails the post is deleted again rather than left half-tagged: the row
 * cascades post_tags and the count triggers unwind with it.
 */
export async function createPostWithTags(uploaderId: string, fields: PostFields): Promise<number> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('posts')
    .insert({
      uploader_id: uploaderId,
      md5: fields.md5,
      file_ext: fields.file_ext,
      file_size: fields.file_size,
      width: fields.width,
      height: fields.height,
      rating: fields.rating,
      source_url: fields.source_url || null,
    })
    .select('id')
    .single()
  if (error) throw new Error(`Could not create the post: ${error.message}`)

  try {
    await setPostTags(supabase, data.id, fields.tags)
  } catch (tagError) {
    await supabase.from('posts').delete().eq('id', data.id)
    throw tagError
  }

  return data.id
}

/** Rewrites an existing post's rating, source and whole tag set. */
export async function updatePostWithTags(
  postId: number,
  fields: Pick<PostFields, 'rating' | 'source_url' | 'tags'>
): Promise<void> {
  const supabase = await createClient()

  // `select` after the update is how "no such post" is detected — an update that
  // matches nothing is not an error to PostgREST, it just returns no row.
  const { data, error } = await supabase
    .from('posts')
    .update({ rating: fields.rating, source_url: fields.source_url || null })
    .eq('id', postId)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`Could not update the post: ${error.message}`)
  if (!data) throw new Error(`Post ${postId} not found`)

  await setPostTags(supabase, postId, fields.tags)
}

/**
 * Adds one view to a post.
 *
 * This was the `increment_post_view` SQL function until `20260829120000`. PostgREST
 * cannot send `view_count = view_count + 1`, so the increment is a read and then a
 * write, and the compare-and-swap is what stands in for the atomicity the SQL function
 * had for free: the update only lands while `view_count` is still what was read, and a
 * concurrent view that got there first makes it match no row, so we read again. Three
 * attempts, then the view is dropped — under real contention a lost view costs less
 * than a retry loop holding a request open.
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

/**
 * Makes `names` the post's exact tag set: creates any missing tag, drops the links
 * that are no longer wanted, adds the ones that are. Every change goes through
 * post_tags rows, so tags.post_count stays right via its trigger.
 */
async function setPostTags(supabase: ServerClient, postId: number, names: string[]): Promise<void> {
  const tagIds = await ensureTagIds(supabase, names)

  // On a fresh post this matches nothing, which is why create and update can share it
  let stale = supabase.from('post_tags').delete().eq('post_id', postId)
  if (tagIds.length > 0) stale = stale.not('tag_id', 'in', `(${tagIds.join(',')})`)
  const { error: staleError } = await stale
  if (staleError) throw new Error(`Could not remove old tags: ${staleError.message}`)

  if (tagIds.length === 0) return

  const { error: linkError } = await supabase.from('post_tags').upsert(
    tagIds.map((tag_id) => ({ post_id: postId, tag_id })),
    // Links the post already has are left untouched, so the count trigger can't double-fire
    { onConflict: 'post_id,tag_id', ignoreDuplicates: true }
  )
  if (linkError) throw new Error(`Could not apply tags: ${linkError.message}`)
}
