import { COLLECTION_TABLES, readCollectionName } from '@common/collections'
import { first, isUniqueViolation, type Db, type DbPool } from '@common/db'
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

  // The rating filter is on the join rather than in a `where`, so a shelf whose every
  // image is behind the setting still produces a row — with a count of zero and no cover —
  // and `hideEmpty` is then the one place that decides whether such a row is drawn.
  //
  // `array_agg(… order by p.id desc)[1]` rather than a lateral join: the group is already
  // being formed for the count, and taking its first element costs nothing more.
  return await db<Collection[]>`
    select c.id,
           c.name,
           count(p.id)::int as post_count,
           (array_agg(p.file_name order by p.id desc))[1] as cover_file_name,
           (array_agg(p.file_ext  order by p.id desc))[1] as cover_file_ext,
           to_char(c.updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
      from ${db(collections)} c
      left join ${db(posts)} p
        on p.collection_id = c.id and p.rating = any(${allowed}::text[])
     group by c.id
    having (${hideEmpty}::bool = false or count(p.id) > 0)
     order by c.updated_at desc, c.id desc`
}

/** One shelf by id, with the same count and cover the list draws. */
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
  return new Map(rows.map((row) => [row.file_name, { id: row.id, collection_name: row.collection_name }]))
}

export type CollectionOutcome<T = unknown> = ({ ok: true } & T) | { ok: false; error: string }

/**
 * Names a new shelf. The name is the whole of it — there is no cover to pick and nothing
 * to file it under.
 *
 * A duplicate is the one failure worth wording, and it is caught rather than asked about
 * first: the unique index on `lower(name)` is what actually decides, so a check-then-insert
 * would be both a second round trip and a race.
 */
export async function createCollection(
  db: Db,
  rawName: string
): Promise<CollectionOutcome<{ id: number; name: string }>> {
  const read = readCollectionName(rawName)
  if ('error' in read) return { ok: false, error: read.error }

  try {
    const [row] = await db<{ id: number }[]>`
      insert into ${db(collections)} ${db({ name: read.name })} returning id`
    return { ok: true, id: row.id, name: read.name }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: `There is already a collection called ${read.name}.` }
    }
    throw error
  }
}

/** Renames a shelf, and touches it — a rename is a change to the shelf, so it belongs at
 *  the top of the list the same way an image added does. */
export async function renameCollection(
  db: Db,
  id: number,
  rawName: string
): Promise<CollectionOutcome<{ name: string }>> {
  const read = readCollectionName(rawName)
  if ('error' in read) return { ok: false, error: read.error }

  try {
    const updated = await db<{ id: number }[]>`
      update ${db(collections)}
         set name = ${read.name}, updated_at = now()
       where id = ${id}
      returning id`
    if (updated.length === 0) return { ok: false, error: 'No such collection.' }
    return { ok: true, name: read.name }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: `There is already a collection called ${read.name}.` }
    }
    throw error
  }
}

/**
 * Deletes an **empty** shelf, and refuses a full one.
 *
 * The refusal is the feature: a collection is the only thing this project stores that is a
 * container, and deleting one by accident would take a set of images that exist nowhere
 * else. `collection_posts.collection_id` has no `on delete cascade`, so the foreign key is
 * the real enforcement and would refuse this anyway — the count below exists to say *why*
 * in words somebody can act on, rather than handing back a constraint name.
 */
export async function deleteCollection(db: Db, id: number): Promise<CollectionOutcome> {
  const [row] = await db<{ count: number }[]>`
    select count(*)::int as count from ${db(posts)} where collection_id = ${id}`
  const held = row?.count ?? 0
  if (held > 0) {
    return {
      ok: false,
      error: `That collection still holds ${held} image${held === 1 ? '' : 's'}. Delete them first.`,
    }
  }

  const gone = await db<{ id: number }[]>`
    delete from ${db(collections)} where id = ${id} returning id`
  return gone.length > 0 ? { ok: true } : { ok: false, error: 'No such collection.' }
}

export type CollectionPostFields = {
  collection_id: number
  file_name: string
  file_ext: string
  file_size: number
  width: number
  height: number
  rating: Rating
  /** Empty string means "no source" — stored as null, as on a post. */
  source_url: string
}

/**
 * Adds one image to a shelf, and moves that shelf to the top of the list.
 *
 * A transaction, and it takes the pool for the reason `createPostWithTags` does: the row
 * and the shelf's `updated_at` are one change. A post that landed while the touch failed
 * would be an image at the bottom of a list that claims nothing has happened to it — which
 * is exactly the sort of quietly-wrong ordering the shelf list is entirely made of.
 */
export async function createCollectionPost(
  db: DbPool,
  fields: CollectionPostFields
): Promise<number> {
  return db.begin(async (tx) => {
    const [row] = await tx<{ id: number }[]>`
      insert into ${tx(posts)} ${tx({
        collection_id: fields.collection_id,
        file_name: fields.file_name,
        file_ext: fields.file_ext,
        file_size: fields.file_size,
        width: fields.width,
        height: fields.height,
        rating: fields.rating,
        source_url: fields.source_url || null,
      })} returning id`

    await touchCollection(tx, fields.collection_id)
    return row.id
  })
}

/**
 * Rewrites what there is to change about a collection post: its tier and its source. Not
 * its collection — that is `moveCollectionPost` below, because it is a change to two
 * shelves rather than to one image.
 *
 * The shelf is **not** touched. The list is ordered by what has happened to the shelf, and
 * correcting a rating is a fact about one image; bumping a whole collection to the top for
 * it would make that ordering mean nothing.
 */
export async function updateCollectionPost(
  db: Db,
  id: number,
  fields: { rating: Rating; source_url: string }
): Promise<CollectionOutcome> {
  const updated = await db<{ id: number }[]>`
    update ${db(posts)}
       set rating = ${fields.rating}, source_url = ${fields.source_url || null}
     where id = ${id}
    returning id`
  return updated.length > 0 ? { ok: true } : { ok: false, error: `Image ${id} not found.` }
}

/**
 * Removes one image from a shelf, answering with the shelf it was on so the caller can go
 * and delete the two stored objects — the row is the only thing that knows where they are.
 * The shelf is touched in the same transaction, for the reason adding one is.
 */
export async function deleteCollectionPostRow(
  db: DbPool,
  id: number
): Promise<{ collectionId: number } | null> {
  return db.begin(async (tx) => {
    const [row] = await tx<{ collection_id: number }[]>`
      delete from ${tx(posts)} where id = ${id} returning collection_id`
    if (!row) return null

    await touchCollection(tx, row.collection_id)
    return { collectionId: row.collection_id }
  })
}

/**
 * Moves an image to another shelf.
 *
 * **Nothing is copied and no object moves.** A collection's images are filed under one flat
 * prefix — `collections/posts/<md5>`, not `collections/<id>/posts/<md5>` — precisely so
 * that this is one column of one row: the name is the md5 and the md5 is the image, so
 * where it is shelved was never part of where its bytes live. That is the payoff of the
 * decision in `@common/collections`, and it is the whole of this function.
 *
 * **Both shelves are touched**, in the same transaction as the move: one lost an image and
 * one gained one, and the list is ordered by exactly that. Touching only the destination
 * would leave the shelf you emptied claiming nothing had happened to it.
 */
export async function moveCollectionPost(
  db: DbPool,
  id: number,
  collectionId: number
): Promise<CollectionOutcome> {
  return db.begin(async (tx) => {
    // The shelf it is leaving has to be read before the update, because afterwards nothing
    // remembers it — the same reason `deletePostRow` reads its links first. A row that is
    // already on the destination is left alone rather than written and reported as moved,
    // which would bump a collection to the top of the list for no change at all.
    const [was] = await tx<{ collection_id: number }[]>`
      select collection_id from ${tx(posts)} where id = ${id}`
    if (!was) return { ok: false as const, error: `Image ${id} not found.` }
    if (was.collection_id === collectionId) {
      return { ok: false as const, error: 'That image is already in that collection.' }
    }

    const moved = await tx<{ id: number }[]>`
      update ${tx(posts)} set collection_id = ${collectionId} where id = ${id} returning id`
    // A destination that is not a collection is refused by the foreign key, which is the
    // right place for it: the id arrives from a menu the window drew out of the shelf list.
    if (moved.length === 0) return { ok: false as const, error: `Image ${id} not found.` }

    await touchCollection(tx, was.collection_id)
    await touchCollection(tx, collectionId)
    return { ok: true as const }
  })
}

/**
 * Moves a shelf to the top of the list. Called by every write above that changes what the
 * shelf holds or what it is called, and by nothing else — a view is not a change to a
 * collection, and neither is correcting one image's rating.
 */
export async function touchCollection(db: Db, id: number): Promise<void> {
  await db`update ${db(collections)} set updated_at = now() where id = ${id}`
}
