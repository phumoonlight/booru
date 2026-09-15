import { COLLECTION_TABLES } from '@common/collections'
import { first, type Db } from '@common/db'
import { RATINGS, type Rating } from '@common/search'

/**
 * Everything a collection is, as queries — the shelf list, one shelf's contents, and the
 * handful of writes that move either.
 *
 * It is deliberately small, and small is the point. A board's data layer is a search
 * grammar, a tag join, a facet read and a counter; a collection has none of those. There
 * is no query here that takes a query: a shelf is read whole, newest first, and that is
 * the entire browsing model. What `@common/data/search` is to the galleries, this file's
 * `listCollectionPosts` is to the shelves, and it takes a collection id and a cursor and
 * nothing else.
 *
 * Like every other module in this directory it takes its handle rather than building one
 * (invariant 3), and the table names come out of `@common/collections` rather than being
 * spelled into a template (invariant 10, one section further out).
 *
 * **`updated_at` is maintained here, in TypeScript.** No trigger does it, for the reason
 * no trigger does `tags.post_count`: a plpgsql body needs a migration to edit and reports
 * an opaque error from inside a statement that was about something else. So every write
 * that changes what a shelf holds — a rename, an image added, removed or moved to another
 * shelf — calls `touchCollection`, inside the same transaction as the change, because the
 * ordering of the list is a fact about the row and not derived data that can be repaired
 * afterwards. A move touches **two**: one shelf lost an image and one gained one.
 */

/** One image on a shelf. `posts`' columns minus everything about tags. */
export type CollectionPost = {
  id: number
  collection_id: number
  file_name: string
  file_ext: string
  file_size: number
  width: number
  height: number
  rating: Rating
  source_url: string | null
  view_count: number
  /** ISO-8601, formatted by the query — the same reason `postColumns` formats it. */
  created_at: string
}

/** A shelf, as the list draws it: its name, how many images it holds, and the one whose
 *  thumbnail is on the card. */
export type Collection = {
  id: number
  name: string
  /** Drawn in front of the name, as typed — `readCollectionMark` settles what may be. */
  mark: string | null
  /** The shelf's own tier. With it restricted and the adult tiers off, the shelf is not
   *  listed and nothing on it is read, whatever each image is rated. */
  rating: Rating
  post_count: number
  /** The newest post's `file_name`, or null for a shelf with nothing on it — the cover. */
  cover_file_name: string | null
  cover_file_ext: string | null
  updated_at: string
}

export type CollectionPostPage = {
  posts: CollectionPost[]
  /** One row read past the screenful, as the feed's is. Nothing counts. */
  hasMore: boolean
}

const { collections, posts } = COLLECTION_TABLES

/** The website's opening screenful of a shelf, and the default for anything that does not
 *  say otherwise. The feed appends the rest. */
export const COLLECTION_PAGE_SIZE = 24

const postColumns = (db: Db) => db`
  id, collection_id, file_name, file_ext, file_size, width, height, rating, source_url,
  view_count,
  to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at`

/**
 * The shelf's own rating, as a condition on a `collection_posts` row. In the query rather
 * than left to the page, because `loadMoreCollectionPosts` is an action anybody can call
 * with any id — a restricted shelf's images must not be one request away from the notice.
 */
const shelfVisible = (db: Db, allowed: string[]) => db`
  exists (select 1 from ${db(collections)} s
           where s.id = collection_id and s.rating = any(${allowed}::text[]))`

/**
 * Every shelf, most recently touched first.
 *
 * **The cover is derived, not stored.** A `cover_post_id` column would be a second thing
 * to keep true — a circular foreign key, a null to handle when that post is deleted, and a
 * picker nobody asked for — to answer a question the newest image on the shelf already
 * answers well. Google Photos does the same thing and nobody notices, which is the
 * recommendation.
 *
 * `visibleRatings` is the same ceiling every listing takes, and it reaches two things
 * here: the count, and the cover. A shelf of R-18 work seen with the setting off would
 * otherwise be a card with a picture on it and a count of nothing. `hideEmpty` then drops
 * those cards entirely, which is what the website wants and the desktop app does not —
 * there, a shelf you have just made and not filled is exactly the row you are looking for.
 */
export async function listCollections(
  db: Db,
  {
    visibleRatings,
    hideEmpty = false,
  }: { visibleRatings?: readonly Rating[]; hideEmpty?: boolean } = {}
): Promise<Collection[]> {
  const allowed = [...(visibleRatings ?? RATINGS)]

  // The images' rating filter is on the join rather than in the `where`, so a shelf whose
  // every image is behind the setting still produces a row — with a count of zero and no
  // cover — and `hideEmpty` is then the one place that decides whether such a row is drawn.
  // The shelf's own rating is in the `where`: a restricted shelf is not a row at all.
  //
  // `array_agg(… order by p.id desc)[1]` rather than a lateral join: the group is already
  // being formed for the count, and taking its first element costs nothing more.
  return await db<Collection[]>`
    select c.id,
           c.name,
           c.mark,
           c.rating,
           count(p.id)::int as post_count,
           (array_agg(p.file_name order by p.id desc))[1] as cover_file_name,
           (array_agg(p.file_ext  order by p.id desc))[1] as cover_file_ext,
           to_char(c.updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
      from ${db(collections)} c
      left join ${db(posts)} p
        on p.collection_id = c.id and p.rating = any(${allowed}::text[])
     where c.rating = any(${allowed}::text[])
     group by c.id
    having (${hideEmpty}::bool = false or count(p.id) > 0)
     order by c.updated_at desc, c.id desc`
}

/**
 * One shelf by id, with the same count and cover the list draws.
 *
 * **Not filtered on the shelf's own rating**, where the list is: a page reached by its own
 * URL answers a restricted shelf with the notice rather than a 404, the way a post's page
 * does, and it needs the row to know which it is.
 */
export async function getCollection(
  db: Db,
  id: number,
  { visibleRatings }: { visibleRatings?: readonly Rating[] } = {}
): Promise<Collection | null> {
  const allowed = [...(visibleRatings ?? RATINGS)]

  return first(
    await db<Collection[]>`
      select c.id,
             c.name,
             c.mark,
             c.rating,
             count(p.id)::int as post_count,
             (array_agg(p.file_name order by p.id desc))[1] as cover_file_name,
             (array_agg(p.file_ext  order by p.id desc))[1] as cover_file_ext,
             to_char(c.updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
        from ${db(collections)} c
        left join ${db(posts)} p
          on p.collection_id = c.id and p.rating = any(${allowed}::text[])
       where c.id = ${id}
       group by c.id`
  )
}

/**
 * A shelf's contents, newest first.
 *
 * No query, no facets, no `start:` — a collection is a set somebody assembled by hand, so
 * the useful order is the one they assembled it in and there is nothing to narrow. `after`
 * is the feed's cursor and means what it means everywhere else: strictly older than that
 * id, never an offset, so an image added mid-scroll does not slide the rows below it.
 */
export async function listCollectionPosts(
  db: Db,
  collectionId: number,
  {
    after,
    perPage = COLLECTION_PAGE_SIZE,
    visibleRatings,
  }: { after?: number; perPage?: number; visibleRatings?: readonly Rating[] } = {}
): Promise<CollectionPostPage> {
  const allowed = [...(visibleRatings ?? RATINGS)]

  try {
    const rows = await db<CollectionPost[]>`
      select ${postColumns(db)}
        from ${db(posts)}
       where collection_id = ${collectionId}
         and rating = any(${allowed}::text[])
         and ${shelfVisible(db, allowed)}
         and (${after ?? null}::int is null or id < ${after ?? null}::int)
       order by id desc
       limit ${perPage + 1}`

    return { posts: rows.slice(0, perPage), hasMore: rows.length > perPage }
  } catch (error) {
    // The grid draws empty rather than throwing, as the board's search does — so the
    // reason has to end up somewhere.
    console.error('listCollectionPosts failed:', error)
    return { posts: [], hasMore: false }
  }
}

export async function getCollectionPost(db: Db, id: number): Promise<CollectionPost | null> {
  return first(
    await db<CollectionPost[]>`select ${postColumns(db)} from ${db(posts)} where id = ${id}`
  )
}

/**
 * The images either side of one, within its own shelf — what prev/next walks.
 *
 * The board's version of this takes a search, because a post there is read inside one.
 * Here the surrounding set is the shelf itself, which is the whole reason a collection
 * post's URL is nested under its collection: there is no other context it could be read
 * in. The rating ceiling still applies, so with the adult tiers off an arrow cannot land
 * on the notice saying they are off.
 */
export async function collectionNeighbours(
  db: Db,
  {
    id,
    collectionId,
    visibleRatings,
  }: { id: number; collectionId: number; visibleRatings?: readonly Rating[] }
): Promise<{ prevId: number | null; nextId: number | null }> {
  const allowed = [...(visibleRatings ?? RATINGS)]

  try {
    const [row] = await db<{ prev_id: number | null; next_id: number | null }[]>`
      with shelf as not materialized (
        select id from ${db(posts)}
         where collection_id = ${collectionId} and rating = any(${allowed}::text[])
           and ${shelfVisible(db, allowed)}
      )
      select (select id from shelf where id > ${id} order by id asc  limit 1) as prev_id,
             (select id from shelf where id < ${id} order by id desc limit 1) as next_id`

    return { prevId: row?.prev_id ?? null, nextId: row?.next_id ?? null }
  } catch (error) {
    console.error('collectionNeighbours failed:', error)
    return { prevId: null, nextId: null }
  }
}

/** The collection holding these bytes already, or null — the dedup question, asked at
 *  staging. A `file_name` is unique across the whole table, so the answer names a shelf
 *  as well as a post: "already in Ukiyo-e studies" is the useful refusal. */
export async function findCollectionPostByFileName(
  db: Db,
  fileName: string
): Promise<{ id: number; collection_id: number; collection_name: string } | null> {
  return first(
    await db<{ id: number; collection_id: number; collection_name: string }[]>`
      select p.id, p.collection_id, c.name as collection_name
        from ${db(posts)} p
        join ${db(collections)} c on c.id = p.collection_id
       where p.file_name = ${fileName}`
  )
}

/** The batch form, for a folder dropped on the window: name → the shelf it is already on. */
export async function findCollectionPostsByFileNames(
  db: Db,
  fileNames: string[]
): Promise<Map<string, { id: number; collection_name: string }>> {
  if (fileNames.length === 0) return new Map()

  const rows = await db<{ id: number; file_name: string; collection_name: string }[]>`
    select p.id, p.file_name, c.name as collection_name
      from ${db(posts)} p
      join ${db(collections)} c on c.id = p.collection_id
     where p.file_name = any(${fileNames})`
  return new Map(
    rows.map((row) => [row.file_name, { id: row.id, collection_name: row.collection_name }])
  )
}
