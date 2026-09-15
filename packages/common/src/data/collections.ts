import { COLLECTION_TABLES, type CollectionListFilter } from '@common/collections'
import { first, type Db } from '@common/db'
import { RATINGS, type Rating } from '@common/search'

/**
 * Everything a collection is, as reads — the shelf list, one shelf's contents, and the
 * newest images across every shelf.
 *
 * Since the boards were dropped (0012) this is the whole of what the website reads. It is
 * still small on purpose: the shelf list takes a name and two filters, a shelf is read
 * whole, newest first, by cursor, and so is the site-wide feed. The writes are
 * `@common/data/collections-write`.
 *
 * Like every other module in this directory it takes its handle rather than building one
 * (invariant 3), and the table names come out of `@common/collections` rather than being
 * spelled into a template (invariant 10).
 *
 * **A rating is the shelf's.** `collection_posts` has no rating column any more; every
 * read of an image below narrows on its collection's `rating` (`shelfVisible`), so the NSFW
 * ceiling is one comparison against one row, wherever an image is read from.
 */

/** One image on a shelf. No tags, and no rating of its own — its shelf's is the rating. */
export type CollectionPost = {
  id: number
  collection_id: number
  file_name: string
  file_ext: string
  file_size: number
  width: number
  height: number
  source_url: string | null
  view_count: number
  /** ISO-8601, formatted by the query, so a row that crosses the IPC bridge or goes into
   *  a `<time dateTime>` is already the string it will be used as. */
  created_at: string
}

/** A shelf, as the list draws it: its name, how many images it holds, and the one whose
 *  thumbnail is on the card. */
export type Collection = {
  id: number
  name: string
  /** Drawn in front of the name, as typed — `readCollectionMark` settles what may be. */
  mark: string | null
  /** The shelf's tier, and so every image on it. With it restricted and the adult tiers
   *  off, the shelf is not listed and nothing on it is read. */
  rating: Rating
  /** A shelf of generated images — what the AI board was, as a fact about a shelf. */
  is_ai: boolean
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

/** An image read outside its shelf, carrying the two facts about that shelf a card in a
 *  mixed feed has to show: its tier and whether it is AI. Inside a shelf the page already
 *  says both once. */
export type LatestCollectionPost = CollectionPost & { rating: Rating; is_ai: boolean }

export type LatestCollectionPostPage = { posts: LatestCollectionPost[]; hasMore: boolean }

const { collections, posts } = COLLECTION_TABLES

/** The website's opening screenful of a shelf, and the default for anything that does not
 *  say otherwise. The feed appends the rest. */
export const COLLECTION_PAGE_SIZE = 24

const postColumns = (db: Db) => db`
  p.id, p.collection_id, p.file_name, p.file_ext, p.file_size, p.width, p.height,
  p.source_url, p.view_count,
  to_char(p.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at`

const shelfColumns = (db: Db) => db`
  c.id,
  c.name,
  c.mark,
  c.rating,
  c.is_ai,
  count(p.id)::int as post_count,
  (array_agg(p.file_name order by p.id desc))[1] as cover_file_name,
  (array_agg(p.file_ext  order by p.id desc))[1] as cover_file_ext,
  to_char(c.updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at`

/**
 * The image's shelf is one the caller may see — as a condition on a row aliased `p`. In the
 * query rather than left to the page, because both feeds are actions anybody can call with
 * any cursor or id: a restricted shelf's images must not be one request away from the
 * notice.
 */
const shelfVisible = (db: Db, allowed: string[]) => db`
  exists (select 1 from ${db(collections)} s
           where s.id = p.collection_id and s.rating = any(${allowed}::text[]))`

/** `%` and `_` are wildcards to `ilike`, and a shelf called `100%` should find itself. */
function containing(needle: string): string {
  return `%${needle.replace(/[\\%_]/g, '\\$&')}%`
}

/**
 * Every shelf, most recently touched first, narrowed by `filter` — a piece of the name
 * (anywhere in it, any case), one tier, AI or not; each optional and meaning "any".
 *
 * **The cover is derived, not stored** — the newest image on the shelf. A `cover_post_id`
 * column would be a circular foreign key, a null to handle when that post is deleted, and a
 * picker nobody asked for, to answer a question the newest image already answers.
 *
 * `visibleRatings` is the ceiling every read takes, and `filter.rating` narrows within it:
 * a visitor with NSFW off who asks for R-18 shelves gets none rather than the setting being
 * reached past. `hideEmpty` drops shelves with nothing on them, which the website wants and
 * the desktop app does not — there, a shelf you have just named is the row you are after.
 *
 * `ilike` over the name with no index behind it: a sequential scan of `collections`, which
 * is a table of shelves somebody named by hand.
 */
export async function listCollections(
  db: Db,
  {
    visibleRatings,
    hideEmpty = false,
    filter = {},
  }: {
    visibleRatings?: readonly Rating[]
    hideEmpty?: boolean
    filter?: CollectionListFilter
  } = {}
): Promise<Collection[]> {
  const visible = [...(visibleRatings ?? RATINGS)]
  const allowed = filter.rating ? visible.filter((rating) => rating === filter.rating) : visible
  const name = filter.name?.trim() ? containing(filter.name.trim()) : null
  const isAi = filter.isAi ?? null

  // `array_agg(… order by p.id desc)[1]` rather than a lateral join: the group is already
  // being formed for the count, and taking its first element costs nothing more.
  return await db<Collection[]>`
    select ${shelfColumns(db)}
      from ${db(collections)} c
      left join ${db(posts)} p on p.collection_id = c.id
     where c.rating = any(${allowed}::text[])
       and (${name}::text is null or c.name ilike ${name}::text)
       and (${isAi}::bool is null or c.is_ai = ${isAi}::bool)
     group by c.id
    having (${hideEmpty}::bool = false or count(p.id) > 0)
     order by c.updated_at desc, c.id desc`
}

/**
 * One shelf by id, with the same count and cover the list draws.
 *
 * **Not filtered on the shelf's rating**, where the list is: a page reached by its own URL
 * answers a restricted shelf with the notice rather than a 404, and it needs the row to
 * know which it is.
 */
export async function getCollection(db: Db, id: number): Promise<Collection | null> {
  return first(
    await db<Collection[]>`
      select ${shelfColumns(db)}
        from ${db(collections)} c
        left join ${db(posts)} p on p.collection_id = c.id
       where c.id = ${id}
       group by c.id`
  )
}

/**
 * A shelf's contents, newest first.
 *
 * No query and no facets — a collection is a set somebody assembled by hand. `after` is
 * the feed's cursor: strictly older than that id, never an offset, so an image added
 * mid-scroll does not slide the rows below it.
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
        from ${db(posts)} p
       where p.collection_id = ${collectionId}
         and ${shelfVisible(db, allowed)}
         and (${after ?? null}::int is null or p.id < ${after ?? null}::int)
       order by p.id desc
       limit ${perPage + 1}`

    return { posts: rows.slice(0, perPage), hasMore: rows.length > perPage }
  } catch (error) {
    // The grid draws empty rather than throwing — so the reason has to end up somewhere.
    console.error('listCollectionPosts failed:', error)
    return { posts: [], hasMore: false }
  }
}

/**
 * The newest images on every shelf the caller may see — the website's `/posts`, which is
 * what the gallery became once its posts were shelved. The same cursor as a shelf's own
 * feed, over the whole table, so it walks the primary key.
 */
export async function listLatestCollectionPosts(
  db: Db,
  {
    after,
    perPage = COLLECTION_PAGE_SIZE,
    visibleRatings,
  }: { after?: number; perPage?: number; visibleRatings?: readonly Rating[] } = {}
): Promise<LatestCollectionPostPage> {
  const allowed = [...(visibleRatings ?? RATINGS)]

  try {
    // A join rather than `shelfVisible`, since the shelf's columns are wanted as well as its
    // permission — the same condition, said once.
    const rows = await db<LatestCollectionPost[]>`
      select ${postColumns(db)}, c.rating, c.is_ai
        from ${db(posts)} p
        join ${db(collections)} c on c.id = p.collection_id
       where c.rating = any(${allowed}::text[])
         and (${after ?? null}::int is null or p.id < ${after ?? null}::int)
       order by p.id desc
       limit ${perPage + 1}`

    return { posts: rows.slice(0, perPage), hasMore: rows.length > perPage }
  } catch (error) {
    console.error('listLatestCollectionPosts failed:', error)
    return { posts: [], hasMore: false }
  }
}

/** How many images the visible shelves hold — the landing page's number. `::int` because
 *  `count(*)` is a `bigint`, which postgres.js hands back as a string. */
export async function countCollectionPosts(
  db: Db,
  { visibleRatings }: { visibleRatings?: readonly Rating[] } = {}
): Promise<number> {
  const allowed = [...(visibleRatings ?? RATINGS)]
  const [row] = await db<{ count: number }[]>`
    select count(*)::int as count from ${db(posts)} p where ${shelfVisible(db, allowed)}`
  return row?.count ?? 0
}

export async function getCollectionPost(db: Db, id: number): Promise<CollectionPost | null> {
  return first(
    await db<CollectionPost[]>`select ${postColumns(db)} from ${db(posts)} p where p.id = ${id}`
  )
}

/**
 * The images either side of one, within its own shelf — what prev/next walks. The shelf's
 * rating is the only one there is, so a blocked shelf has no neighbours to walk to.
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
        select p.id from ${db(posts)} p
         where p.collection_id = ${collectionId} and ${shelfVisible(db, allowed)}
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
