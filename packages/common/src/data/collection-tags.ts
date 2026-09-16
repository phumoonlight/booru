import { COLLECTION_TABLES } from '@common/collections'
import type { Db } from '@common/db'

/**
 * A shelf's own tags, as reads: the pill bar above a collection, and the words on one
 * image.
 *
 * **These are not the board's vocabulary.** `tags` is one global row per name with a
 * category, a mark and a rating floor; a collection tag is a word that belongs to one shelf
 * and means what that shelf means by it (0013). Nothing here touches `tags`, and
 * `@common/data/tags` does not touch these.
 *
 * Like every other module in this directory it takes its handle rather than building one
 * (invariant 3), and the table names come out of `@common/collections` (invariant 10).
 */

const { tags, postTags } = COLLECTION_TABLES

/** One of a shelf's tags, with how many of its images carry it — what a pill says. */
export type CollectionTag = {
  id: number
  name: string
  /** A colour (a dot) or text drawn before the name — `markColor` decides which. */
  mark: string | null
  post_count: number
}

/**
 * Every tag on one shelf, A–Z, each with its count.
 *
 * **Counted in the read, not stored.** A `post_count` column here would be the third
 * denormalized counter this project has talked itself out of, and for the same reason: a
 * shelf holds a handful of tags, so the count is a join the pill bar was making anyway.
 *
 * A tag nothing carries still comes back — a `left join`, count zero. It is a word somebody
 * made on purpose and has not used yet, and hiding it would make the tag they just created
 * vanish from the bar they made it in.
 *
 * Ordered by name rather than by count: a bar whose pills move as images are tagged is a
 * bar you have to re-read every time you use it.
 */
export async function listCollectionTags(
  db: Db,
  collectionId: number
): Promise<CollectionTag[]> {
  try {
    return await db<CollectionTag[]>`
      select t.id, t.name, t.mark, count(pt.post_id)::int as post_count
        from ${db(tags)} t
        left join ${db(postTags)} pt on pt.tag_id = t.id
       where t.collection_id = ${collectionId}
       group by t.id
       order by t.name`
  } catch (error) {
    // The bar draws empty rather than taking the page down with it: a shelf without its
    // pills is still a shelf full of images.
    console.error('listCollectionTags failed:', error)
    return []
  }
}

/** The tags on one image, A–Z. Ids as well as names, since the desktop panel takes one
 *  off by id and the website links by name. */
export async function listPostTags(
  db: Db,
  postId: number
): Promise<Omit<CollectionTag, 'post_count'>[]> {
  try {
    return await db<Omit<CollectionTag, 'post_count'>[]>`
      select t.id, t.name, t.mark
        from ${db(postTags)} pt
        join ${db(tags)} t on t.id = pt.tag_id
       where pt.post_id = ${postId}
       order by t.name`
  } catch (error) {
    console.error('listPostTags failed:', error)
    return []
  }
}

/**
 * The condition "this image carries every one of `names`", for a row aliased `p` — what
 * `listCollectionPosts` applies when a shelf's URL names tags.
 *
 * **AND, counted rather than joined.** `(post_id, tag_id)` is the primary key of the link
 * table, so an image cannot carry one tag twice: if as many of the shelf's tags named here
 * are on it as were asked for, it carries all of them. One scalar subquery says that, where
 * a join per tag would be a query whose shape depends on how many pills are lit.
 *
 * The names are matched within the shelf's own tags, which is the whole of what makes this
 * local: `landscape` on one shelf and `landscape` on another are two rows, and only the
 * one belonging to `p`'s collection can match here.
 */
export function postHasTags(db: Db, names: readonly string[]) {
  const wanted = [...names]
  // No names is `true`, not a subquery that happens to be skipped: Postgres plans the
  // subquery either way, so an unfiltered shelf would otherwise need `collection_post_tags`
  // to exist — and a website deployed ahead of its migration would draw every shelf empty.
  if (wanted.length === 0) return db`true`
  return db`(
    select count(*) from ${db(postTags)} pt
      join ${db(tags)} t on t.id = pt.tag_id
     where pt.post_id = p.id
       and t.collection_id = p.collection_id
       and t.name = any(${wanted}::text[])
  ) = ${wanted.length}::int`
}
