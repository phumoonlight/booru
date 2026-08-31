import type { BooruClient } from '@/lib/supabase/types'
import { syncRatingCounts, syncTagPostCounts } from '@/lib/data/counters'
import type { Rating } from '@/lib/search'
import type { Tag } from '@/lib/tags'

// The query logic two front ends run: the web's server actions and the desktop
// uploader in packages/desktop. Everything here takes its clients rather than
// building them, which is the whole point — `server.ts` reaches for `next/headers`
// and `admin.ts` is `server-only`, so a file that calls either can only run inside
// Next. `posts.ts` and `tags.ts` wrap these with the request-scoped clients the web
// has, so no call site in `src/` changed when they moved.
//
// The post write path. These replace the create_post_with_tags / update_post_with_tags
// SQL functions. Each step is now a request you can see, log and re-run on its own; what
// is lost is the single transaction the functions ran in, so the create path undoes its
// own work (see below) and every failure carries the message of the step that produced it.
//
// That includes the counters: `tags.post_count` and `rating_counts` were kept by triggers
// on the rows these functions write, and are recomputed here instead
// (lib/data/counters.ts). Every write below is followed by a sync naming exactly the tags
// and ratings it moved.
//
// Every function takes its clients rather than building them, for two reasons. `admin` is
// the service-role client and `supabase` is the caller's session, so the split that used
// to be `security definer` vs. not is visible in the signature. And it keeps this file
// clear of `server-only` and of `next/headers`, so the desktop uploader
// (packages/desktop) creates posts through this exact code rather than a second copy of
// it.

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
 * The id of the post holding these bytes, or null. Only the id, because dedup is the
 * only question asked of it — the uploader says "already exists" and links to that post.
 */
export async function findPostIdByMd5(supabase: BooruClient, md5: string): Promise<number | null> {
  const { data } = await supabase.from('posts').select('id').eq('md5', md5).maybeSingle()
  return data?.id ?? null
}

/**
 * Inserts a post and its tag links, returning the new id. Runs on the caller's
 * session so RLS records the uploader; pass the signed-in profile's id.
 *
 * If tagging fails the post is deleted again rather than left half-tagged, counters
 * included — the delete goes through `deletePostRow`, so whatever links did land are
 * counted back down.
 */
export async function createPostWithTags(
  supabase: BooruClient,
  admin: BooruClient,
  uploaderId: string,
  fields: PostFields
): Promise<number> {
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

  await syncRatingCounts(admin, [fields.rating])

  try {
    const moved = await setPostTags(supabase, data.id, fields.tags)
    await syncTagPostCounts(admin, moved)
  } catch (tagError) {
    await deletePostRow(supabase, admin, data.id, fields.rating)
    throw tagError
  }

  return data.id
}

/** Rewrites an existing post's rating, source and whole tag set. */
export async function updatePostWithTags(
  supabase: BooruClient,
  admin: BooruClient,
  postId: number,
  fields: Pick<PostFields, 'rating' | 'source_url' | 'tags'>
): Promise<void> {
  // The rating on the way in, because the counters need to know which tier the post
  // is leaving as well as which it is joining — the trigger had `old` handed to it.
  const { data: before } = await supabase
    .from('posts')
    .select('rating')
    .eq('id', postId)
    .maybeSingle()

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

  // An ordinary edit — a source fix, a retag — leaves the tiers alone. That is what
  // the trigger bought with `update of rating` plus its `is distinct from` guard;
  // same guard, spelled here.
  if (before && before.rating !== fields.rating) {
    await syncRatingCounts(admin, [before.rating, fields.rating])
  }

  const moved = await setPostTags(supabase, postId, fields.tags)
  await syncTagPostCounts(admin, moved)
}

/**
 * Deletes a post and recounts what that emptied. The row cascades `post_tags`, so the
 * links have to be read before it goes — afterwards nothing is left to say which tags
 * lost a post.
 *
 * Shared by the delete action and the create path unwind, so neither can forget half
 * of it.
 */
export async function deletePostRow(
  supabase: BooruClient,
  admin: BooruClient,
  postId: number,
  rating: string
): Promise<void> {
  const { data: links } = await supabase.from('post_tags').select('tag_id').eq('post_id', postId)
  const tagIds = (links ?? []).map((row) => row.tag_id as number)

  const { error } = await supabase.from('posts').delete().eq('id', postId)
  if (error) throw new Error(`Delete failed: ${error.message}`)

  await Promise.all([syncRatingCounts(admin, [rating]), syncTagPostCounts(admin, tagIds)])
}

/**
 * Ids for `names`, creating any tag that isn't on the board yet. `ignoreDuplicates`
 * makes the write an `on conflict do nothing`, so an existing tag keeps its category
 * and its post_count — only genuinely new names get a row.
 */
export async function ensureTagIds(supabase: BooruClient, names: string[]): Promise<number[]> {
  if (names.length === 0) return []

  const { error } = await supabase
    .from('tags')
    .upsert(
      names.map((name) => ({ name })),
      { onConflict: 'name', ignoreDuplicates: true }
    )
  if (error) throw new Error(`Could not create tags: ${error.message}`)

  const { data, error: readError } = await supabase.from('tags').select('id').in('name', names)
  if (readError) throw new Error(`Could not read tags: ${readError.message}`)
  return (data ?? []).map((row) => row.id)
}

/**
 * Makes `names` the post's exact tag set: creates any missing tag, drops the links
 * that are no longer wanted, adds the ones that are.
 *
 * Returns the tags whose link count actually moved — the ones dropped plus the ones
 * added — which is what the caller hands `syncTagPostCounts`. That is why the wanted
 * set is diffed against the links already stored rather than written blind: a retag
 * that only reorders the box moves no counter, and recounting every tag on the post
 * would be work with no answer to show for it.
 */
async function setPostTags(
  supabase: BooruClient,
  postId: number,
  names: string[]
): Promise<number[]> {
  const wanted = await ensureTagIds(supabase, names)

  // On a fresh post this comes back empty, which is why create and update share this
  const { data: linked, error: linkedError } = await supabase
    .from('post_tags')
    .select('tag_id')
    .eq('post_id', postId)
  if (linkedError) throw new Error(`Could not read the current tags: ${linkedError.message}`)

  const have = new Set((linked ?? []).map((row) => row.tag_id as number))
  const want = new Set(wanted)
  const removed = [...have].filter((id) => !want.has(id))
  const added = [...want].filter((id) => !have.has(id))

  if (removed.length > 0) {
    const { error } = await supabase
      .from('post_tags')
      .delete()
      .eq('post_id', postId)
      .in('tag_id', removed)
    if (error) throw new Error(`Could not remove old tags: ${error.message}`)
  }

  if (added.length > 0) {
    const { error } = await supabase
      .from('post_tags')
      .insert(added.map((tag_id) => ({ post_id: postId, tag_id })))
    if (error) throw new Error(`Could not apply tags: ${error.message}`)
  }

  return [...removed, ...added]
}

/**
 * Tags whose name starts with `query`, most used first — backs the tag field's autocomplete.
 * A prefix match, the same shape the search bar's suggestions have: a substring match put
 * whatever was popular ahead of the tag being typed — `hair` offered `black_hair` before
 * `hair` itself — and a tag is reached by its own opening far more often than by a word
 * buried in it.
 * `_` is a LIKE wildcard and nearly every multi-word tag carries one, so it's escaped:
 * otherwise `black_h` would also match `blackXh`.
 */
export async function searchTags(
  supabase: BooruClient,
  query: string,
  limit = 8
): Promise<Tag[]> {
  const needle = query.trim().toLowerCase().replace(/[\\%_]/g, '\\$&')
  if (!needle) return []

  const { data } = await supabase
    .from('tags')
    .select('id, name, category, post_count')
    .ilike('name', `${needle}%`)
    .order('post_count', { ascending: false })
    .order('name')
    .limit(limit)
  return data ?? []
}

/**
 * Every tag, most used first — the index behind the web's /tags page and the desktop
 * uploader's Tags screen. It lives here rather than in `tags.ts` for the same reason the
 * write path does: the Electron app has no request-scoped client to build.
 *
 * The cap is the read's, not the page's. Ordering by `post_count` is what decides which
 * tags a capped read lets through; the screens then sort the ones they got by name,
 * because you arrive at an index holding a name, not a size.
 */
export async function listTags(supabase: BooruClient, limit = 200): Promise<Tag[]> {
  const { data } = await supabase
    .from('tags')
    .select('id, name, category, post_count')
    .order('post_count', { ascending: false })
    .order('name')
    .limit(limit)
  return data ?? []
}
