import type { Db, DbPool } from '@common/db'
import { syncTagPostCounts } from '@common/data/counters'
import type { Rating } from '@common/search'
import type { Tag } from '@common/tags'

// The query logic two front ends run: the website's reads and the desktop app's writes.
// Everything here takes its handle rather than building one, which is the whole point —
// `packages/desktop` creates posts through this exact code rather than a second copy of
// it (invariant 3).
//
// The post write path. These were `create_post_with_tags` / `update_post_with_tags` in
// plpgsql, then a sequence of PostgREST requests with a hand-written unwind, and are
// back inside one transaction now — which is what a database was always going to be
// better at than a `catch` block. Every step is still a statement you can read; what is
// no longer needed is the paragraph explaining what happens when step three fails.
//
// The counter is the exception and stays outside the transaction on purpose. It is
// derived data, it recomputes rather than increments (./counters.ts), and it must not be
// able to fail an upload that has already landed.

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
export async function findPostIdByFileName(db: Db, fileName: string): Promise<number | null> {
  const [row] = await db<{ id: number }[]>`select id from posts where file_name = ${fileName}`
  return row?.id ?? null
}

/**
 * Which of these file names are already posts, as a name → id map. The batch form of
 * `findPostIdByFileName`, for the desktop app's staging step: a folder dropped on the
 * window is checked against the board before anything is uploaded, and asking forty
 * times one at a time is the same answer four hundred milliseconds later.
 *
 * A name that is not a post is simply absent from the map — the caller asked about files
 * it has, not about rows.
 */
export async function findPostIdsByFileNames(
  db: Db,
  fileNames: string[]
): Promise<Map<string, number>> {
  if (fileNames.length === 0) return new Map()

  const rows = await db<{ id: number; file_name: string }[]>`
    select id, file_name from posts where file_name = any(${fileNames})`
  return new Map(rows.map((row) => [row.file_name, row.id]))
}

/**
 * Inserts a post and its tag links, returning the new id.
 *
 * **The unwind is gone.** There was no transaction when these were PostgREST requests,
 * so this function deleted the post it had just inserted if tagging failed, and that
 * delete had to go through `deletePostRow` so the counters came back down with it. A
 * `begin` says the same thing in one word and says it correctly — an unwind is itself a
 * write that can fail, which is the case the old code could not do anything about.
 *
 * A name the board has no tag for is still one of the ways this fails; the difference is
 * that nothing is left behind when it does.
 *
 * It takes the pool rather than a `Db`, because only the pool can open a transaction —
 * the one function in this directory that does.
 */
export async function createPostWithTags(db: DbPool, fields: PostFields): Promise<number> {
  const { id, moved } = await db.begin(async (tx) => {
    const [post] = await tx<{ id: number }[]>`
      insert into posts ${tx({
        file_name: fields.file_name,
        file_ext: fields.file_ext,
        file_size: fields.file_size,
        width: fields.width,
        height: fields.height,
        rating: fields.rating,
        source_url: fields.source_url || null,
      })} returning id`

    return { id: post.id, moved: await setPostTags(tx, post.id, fields.tags) }
  })

  await syncTagPostCounts(db, moved)
  return id
}

/** Rewrites an existing post's rating, source and whole tag set. */
export async function updatePostWithTags(
  db: DbPool,
  postId: number,
  fields: Pick<PostFields, 'rating' | 'source_url' | 'tags'>
): Promise<void> {
  const moved = await db.begin(async (tx) => {
    // `returning` is how "no such post" is detected — an update that matches nothing is
    // not an error, it just changes no row.
    const updated = await tx<{ id: number }[]>`
      update posts
         set rating = ${fields.rating}, source_url = ${fields.source_url || null}
       where id = ${postId}
      returning id`
    if (updated.length === 0) throw new Error(`Post ${postId} not found`)

    return setPostTags(tx, postId, fields.tags)
  })

  await syncTagPostCounts(db, moved)
}

/**
 * Deletes a post and recounts what that emptied. The row cascades `post_tags`, so the
 * links have to be read before it goes — afterwards nothing is left to say which tags
 * lost a post. Both in one statement, which is what a `with` is for.
 *
 * Shared by the delete path and nothing else now that the create path unwinds itself.
 */
export async function deletePostRow(db: Db, postId: number): Promise<void> {
  const rows = await db<{ tag_id: number }[]>`
    with links as (select tag_id from post_tags where post_id = ${postId}),
         gone as (delete from posts where id = ${postId})
    select tag_id from links`

  await syncTagPostCounts(db, rows.map((row) => row.tag_id))
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
 * save, and the post editor writes on every control use.
 *
 * The order of `names` is preserved, which one caller depends on: `setTagRule` asks for
 * the trigger and its targets in one lookup and takes the trigger back off the front.
 */
export async function resolveTagIds(db: Db, names: string[]): Promise<number[]> {
  if (names.length === 0) return []

  const rows = await db<{ id: number; name: string }[]>`
    select id, name from tags where name = any(${names})`

  const found = new Map(rows.map((row) => [row.name, row.id]))
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
 * added — which is what the caller hands `syncTagPostCounts`. That is why the wanted set
 * is diffed against the links already stored rather than written blind: a retag that
 * only reorders the box moves no counter, and recounting every tag on the post would be
 * work with no answer to show for it.
 */
async function setPostTags(db: Db, postId: number, names: string[]): Promise<number[]> {
  const wanted = await resolveTagIds(db, names)

  // Each half `returning` what it actually touched, so the moved set comes back from the
  // writes themselves rather than from a read taken beforehand and trusted to still be
  // true. The diff that used to be computed in TypeScript — two sets, two array filters
  // — is what `<> all` and `on conflict do nothing` say here.
  //
  // The casts are not decoration: `wanted` is empty whenever a post is being stripped of
  // every tag, and postgres.js cannot tell the server what an empty array holds without
  // being told. Untyped, `all('{}')` is an error rather than the "matches nothing" it
  // reads as.
  const removed = await db<{ tag_id: number }[]>`
    delete from post_tags
     where post_id = ${postId} and tag_id <> all(${wanted}::int[])
    returning tag_id`

  const added = await db<{ tag_id: number }[]>`
    insert into post_tags (post_id, tag_id)
    select ${postId}, unnest(${wanted}::int[])
        on conflict do nothing
    returning tag_id`

  return [...removed.map((row) => row.tag_id), ...added.map((row) => row.tag_id)]
}

/**
 * Tags whose name starts with `query`, most used first — backs the tag field's
 * autocomplete. A prefix match, the same shape the search bar's suggestions have: a
 * substring match put whatever was popular ahead of the tag being typed — `hair` offered
 * `black_hair` before `hair` itself — and a tag is reached by its own opening far more
 * often than by a word buried in it.
 *
 * `_` is a LIKE wildcard and nearly every multi-word tag carries one, so it's escaped:
 * otherwise `black_h` would also match `blackXh`.
 *
 * `like`, not `ilike`, and that is the whole point of `tags_name_prefix_idx`. No btree
 * index can serve `ILIKE` — not under `text_pattern_ops`, not under any opclass — so
 * with `ilike` here the index would be maintained on every tag write and used by
 * nothing, and every keystroke that reached the board would be a sequential scan of
 * `tags`. The two return the same rows regardless: `tags.name` is checked against
 * `^[a-z0-9_().-]+$`, so it can only be lowercase, and the needle is lowercased below.
 */
export async function searchTags(db: Db, query: string, limit = 8): Promise<Tag[]> {
  const needle = query.trim().toLowerCase().replace(/[\\%_]/g, '\\$&')
  if (!needle) return []

  return await db<Tag[]>`
    select id, name, category, mark, post_count
      from tags
     where name like ${`${needle}%`}
     order by post_count desc, name
     limit ${limit}`
}

/**
 * Every tag, most used first — the index behind the web's /tags page and the desktop
 * app's Tags screen. It lives here rather than in `tags.ts` for the same reason the
 * write path does: the Electron app has no request-scoped handle to build.
 *
 * The cap is the read's, not the page's. Ordering by `post_count` is what decides which
 * tags a capped read lets through; the screens then sort the ones they got by name,
 * because you arrive at an index holding a name, not a size.
 *
 * The section's **name** comes back beside the id it is stored as — a left join, where
 * this was PostgREST's one genuinely awkward embed: two paths lead from `tags` to
 * `tag_form_sections` (this column, and the many-to-many through `tag_form_section_deps`),
 * so the embed was ambiguous and had to name a foreign-key constraint to disambiguate.
 * Get that wrong and the whole read failed — which is how the Tags screen once went
 * blank saying "no tags yet", the error having been swallowed by a `?? []`.
 */
export async function listTags(db: Db, limit = 200): Promise<Tag[]> {
  // Thrown rather than answered with an empty list — the caller does not catch this, and
  // that is deliberate. A read that fails and a board with no tags are not the same
  // thing, and the screens cannot tell them apart: "no tags yet" is what a broken query
  // looked like for as long as it took to notice. Every other read in this file is a page
  // that degrades; this one is the vocabulary.
  return await db<Tag[]>`
    select t.id, t.name, t.category, t.mark, t.post_count, t.form_section_id,
           s.name as form_section
      from tags t
      left join tag_form_sections s on s.id = t.form_section_id
     order by t.post_count desc, t.name
     limit ${limit}`
}
