import type { BooruClient } from '@common/supabase/types'
import { syncTagPostCounts } from '@common/data/counters'
import type { Rating } from '@common/search'
import type { Tag } from '@common/tags'

// The query logic two front ends run: the web's server actions and the desktop
// uploader in packages/desktop. Everything here takes its clients rather than
// building them, which is the whole point — `server.ts` reaches for `next/headers`
// and `admin.ts` is `server-only`, so a file that calls either can only run inside
// Next. The web's `src/lib/data/posts.ts` and `tags.ts` wrap these with its
// request-scoped clients, so nothing in a page or an action sees the difference.
//
// The post write path. These replace the create_post_with_tags / update_post_with_tags
// SQL functions. Each step is now a request you can see, log and re-run on its own; what
// is lost is the single transaction the functions ran in, so the create path undoes its
// own work (see below) and every failure carries the message of the step that produced it.
//
// That includes the counter: `tags.post_count` was kept by a trigger on the rows these
// functions write, and is recomputed here instead (./counters.ts). Every write below is
// followed by a sync naming exactly the tags it moved.
//
// Every function takes its client rather than building one. That is what keeps this file
// clear of `server-only` and of `next/headers`, so the desktop app (packages/desktop)
// creates posts through this exact code rather than a second copy of it.
//
// There used to be two clients here — the uploader's session for the post row, so RLS
// could record who wrote it, and the service role for storage and the counters. The
// accounts and `uploader_id` are both gone and no table has a write policy left, so a
// write is a write: one service-role client, held only by the desktop app.

export type PostFields = {
  file_name: string
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
 *
 * `fileName` is the md5 of the bytes: it is the name both stored files take, and being
 * derived from the content is what lets it answer this question at all.
 */
export async function findPostIdByFileName(
  client: BooruClient,
  fileName: string
): Promise<number | null> {
  const { data } = await client.from('posts').select('id').eq('file_name', fileName).maybeSingle()
  return data?.id ?? null
}

/**
 * Which of these file names are already posts, as a name → id map. The batch form of
 * `findPostIdByFileName`, for the desktop app's staging step: a folder dropped on the
 * queue is checked against the board before anything is uploaded, and asking forty times
 * one at a time is the same answer four hundred milliseconds later.
 *
 * A name that is not a post is simply absent from the map — the caller asked about files
 * it has, not about rows.
 */
export async function findPostIdsByFileNames(
  client: BooruClient,
  fileNames: string[]
): Promise<Map<string, number>> {
  const found = new Map<string, number>()
  if (fileNames.length === 0) return found

  const { data } = await client.from('posts').select('id, file_name').in('file_name', fileNames)
  for (const row of data ?? []) found.set(row.file_name, row.id)
  return found
}

/**
 * Inserts a post and its tag links, returning the new id.
 *
 * If tagging fails the post is deleted again rather than left half-tagged, counters
 * included — the delete goes through `deletePostRow`, so whatever links did land are
 * counted back down. A name the board has no tag for is one of the ways it fails.
 */
export async function createPostWithTags(
  client: BooruClient,
  fields: PostFields
): Promise<number> {
  const { data, error } = await client
    .from('posts')
    .insert({
      file_name: fields.file_name,
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
    const moved = await setPostTags(client, data.id, fields.tags)
    await syncTagPostCounts(client, moved)
  } catch (tagError) {
    await deletePostRow(client, data.id)
    throw tagError
  }

  return data.id
}

/** Rewrites an existing post's rating, source and whole tag set. */
export async function updatePostWithTags(
  client: BooruClient,
  postId: number,
  fields: Pick<PostFields, 'rating' | 'source_url' | 'tags'>
): Promise<void> {
  // `select` after the update is how "no such post" is detected — an update that
  // matches nothing is not an error to PostgREST, it just returns no row.
  const { data, error } = await client
    .from('posts')
    .update({ rating: fields.rating, source_url: fields.source_url || null })
    .eq('id', postId)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`Could not update the post: ${error.message}`)
  if (!data) throw new Error(`Post ${postId} not found`)

  const moved = await setPostTags(client, postId, fields.tags)
  await syncTagPostCounts(client, moved)
}

/**
 * Deletes a post and recounts what that emptied. The row cascades `post_tags`, so the
 * links have to be read before it goes — afterwards nothing is left to say which tags
 * lost a post.
 *
 * Shared by the delete action and the create path unwind, so neither can forget half
 * of it.
 */
export async function deletePostRow(client: BooruClient, postId: number): Promise<void> {
  const { data: links } = await client.from('post_tags').select('tag_id').eq('post_id', postId)
  const tagIds = (links ?? []).map((row) => row.tag_id as number)

  const { error } = await client.from('posts').delete().eq('id', postId)
  if (error) throw new Error(`Delete failed: ${error.message}`)

  await syncTagPostCounts(client, tagIds)
}

/**
 * Ids for `names`, every one of which must already be a tag on the board. A name that
 * isn't ends the write, naming the ones it couldn't find.
 *
 * It used to coin the missing ones with an `on conflict do nothing` upsert, which cost
 * two things. The visible one: a typo in a tag field became a tag, in an app where
 * naming one is otherwise the Tags screen's job — that screen has the whole vocabulary
 * on it, so a near-duplicate is seen before it is made. The quiet one: Postgres draws
 * the identity default *before* it tests the conflict, so every tag a post already had
 * burned a `tags.id` and threw the row away. A twenty-tag post spent twenty ids on each
 * save, and the post editor writes on every control use, so re-tagging a handful of
 * posts opened gaps of hundreds in the id column.
 */
export async function resolveTagIds(client: BooruClient, names: string[]): Promise<number[]> {
  if (names.length === 0) return []

  const { data, error } = await client.from('tags').select('id, name').in('name', names)
  if (error) throw new Error(`Could not read tags: ${error.message}`)

  const found = new Map((data ?? []).map((row) => [row.name as string, row.id as number]))
  const missing = names.filter((name) => !found.has(name))
  if (missing.length > 0) {
    throw new Error(
      `Not a tag on this board: ${missing.join(', ')} — create it on the Tags screen first.`
    )
  }
  return names.map((name) => found.get(name) as number)
}

/**
 * Makes `names` the post's exact tag set: drops the links that are no longer wanted,
 * adds the ones that are. Every name has to be a tag already — see `resolveTagIds`.
 *
 * Returns the tags whose link count actually moved — the ones dropped plus the ones
 * added — which is what the caller hands `syncTagPostCounts`. That is why the wanted
 * set is diffed against the links already stored rather than written blind: a retag
 * that only reorders the box moves no counter, and recounting every tag on the post
 * would be work with no answer to show for it.
 */
async function setPostTags(
  client: BooruClient,
  postId: number,
  names: string[]
): Promise<number[]> {
  const wanted = await resolveTagIds(client, names)

  // On a fresh post this comes back empty, which is why create and update share this
  const { data: linked, error: linkedError } = await client
    .from('post_tags')
    .select('tag_id')
    .eq('post_id', postId)
  if (linkedError) throw new Error(`Could not read the current tags: ${linkedError.message}`)

  const have = new Set((linked ?? []).map((row) => row.tag_id as number))
  const want = new Set(wanted)
  const removed = [...have].filter((id) => !want.has(id))
  const added = [...want].filter((id) => !have.has(id))

  if (removed.length > 0) {
    const { error } = await client
      .from('post_tags')
      .delete()
      .eq('post_id', postId)
      .in('tag_id', removed)
    if (error) throw new Error(`Could not remove old tags: ${error.message}`)
  }

  if (added.length > 0) {
    const { error } = await client
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
 *
 * `like`, not `ilike`, and that is the whole point of `tags_name_prefix_idx`. No btree
 * index can serve `ILIKE` — not under `text_pattern_ops`, not under any opclass — so
 * with `ilike` here the index was maintained on every tag write and used by nothing,
 * and every keystroke that reached the board was a sequential scan of `tags`. The two
 * return the same rows regardless: `tags.name` is checked against `^[a-z0-9_().-]+$`,
 * so it can only be lowercase, and the needle is lowercased on the line above.
 */
export async function searchTags(
  client: BooruClient,
  query: string,
  limit = 8
): Promise<Tag[]> {
  const needle = query.trim().toLowerCase().replace(/[\\%_]/g, '\\$&')
  if (!needle) return []

  const { data } = await client
    .from('tags')
    .select('id, name, category, mark, post_count')
    .like('name', `${needle}%`)
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
export async function listTags(client: BooruClient, limit = 200): Promise<Tag[]> {
  const { data, error } = await client
    .from('tags')
    // The one read that asks about the form section, because the desktop tag form is the
    // one thing that draws it and this is the read behind it. Autocomplete and the post
    // page's tag list leave it alone rather than carry a field they never use. `mark` is
    // the other way round and every read carries it — it is drawn in front of the name
    // wherever a name is drawn.
    //
    // The name is embedded rather than joined by hand above: a section is an id on the row
    // and a word on the screen, and this is the one place the two meet — the same split the
    // tag rules make. Both come back, the id to write with and the name to group by.
    //
    // **The constraint is named** because there are two ways from `tags` to
    // `tag_form_section`: this column, and the many-to-many PostgREST infers through
    // `tag_form_section_dep`. Without the hint the embed is ambiguous and the whole read
    // fails — which is how the Tags screen once went blank saying "no tags yet", the error
    // having been swallowed by the `data ?? []` below. It is checked now.
    .select(
      'id, name, category, mark, post_count, form_section_id, tag_form_section!tags_form_section_id_fkey(name)'
    )
    .order('post_count', { ascending: false })
    .order('name')
    .limit(limit)

  // Thrown rather than answered with an empty list. A read that fails and a board with no
  // tags are not the same thing, and the screens cannot tell them apart: "no tags yet" is
  // what a broken query looked like for as long as it took to notice. Every other read in
  // this file is a page that degrades; this one is the vocabulary.
  if (error) throw new Error(`Could not read the tags: ${error.message}`)

  // Flattened here so nothing above ever handles the embed's shape. A tag on no section has
  // no embedded row, which is null either way.
  return (data ?? []).map(({ tag_form_section, ...tag }) => ({
    ...tag,
    // PostgREST types a one-to-one embed as an array, which it is not: the foreign key is
    // on this row, so there is at most one. Through `unknown` because the two shapes do not
    // overlap enough for the compiler to take it on trust.
    form_section: (tag_form_section as unknown as { name: string } | null)?.name ?? null,
  })) as Tag[]
}
