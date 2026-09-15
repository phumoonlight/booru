import { COLLECTION_TABLES, readCollectionMark, readCollectionName } from '@common/collections'
import { isUniqueViolation, type Db, type DbPool } from '@common/db'
import type { Rating } from '@common/search'

/**
 * The handful of writes that change what a shelf is or what is on it.
 *
 * Apart from the reads because of what every one of them has to remember and no read does:
 * **`updated_at` is maintained here, in TypeScript.** No trigger does it, for the reason no
 * trigger does `tags.post_count` — a plpgsql body needs a migration to edit and reports an
 * opaque error from inside a statement that was about something else. So every write that
 * changes what a shelf holds calls `touchCollection`, inside the same transaction as the
 * change, because the ordering of the list is a fact about the row and not derived data
 * that can be repaired afterwards. A move touches **two**: one shelf lost an image and one
 * gained one.
 */

const { collections, posts } = COLLECTION_TABLES

export type CollectionOutcome<T = unknown> = ({ ok: true } & T) | { ok: false; error: string }

/** What a shelf is, as typed into the desktop app's form — settled by `readCollectionFields`. */
export type CollectionInput = { name: string; mark: string; rating: Rating }

type CollectionFields = { name: string; mark: string | null; rating: Rating }

/** The name and the mark settled together, so a form with both wrong says the first. The
 *  rating is the caller's to check, arriving as it does from a `<select>`. */
function readCollectionFields(input: CollectionInput): CollectionFields | { error: string } {
  const name = readCollectionName(input.name)
  if ('error' in name) return name
  const mark = readCollectionMark(input.mark)
  if ('error' in mark) return mark
  return { name: name.name, mark: mark.mark, rating: input.rating }
}

/**
 * Names a new shelf, with its mark and its rating. There is no cover to pick and nothing to
 * file it under.
 *
 * A duplicate is the one failure worth wording, and it is caught rather than asked about
 * first: the unique index on `lower(name)` is what actually decides, so a check-then-insert
 * would be both a second round trip and a race.
 */
export async function createCollection(
  db: Db,
  input: CollectionInput
): Promise<CollectionOutcome<{ id: number } & CollectionFields>> {
  const read = readCollectionFields(input)
  if ('error' in read) return { ok: false, error: read.error }

  try {
    const [row] = await db<{ id: number }[]>`
      insert into ${db(collections)} ${db(read)} returning id`
    return { ok: true, id: row.id, ...read }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: `There is already a collection called ${read.name}.` }
    }
    throw error
  }
}

/**
 * Rewrites a shelf's name, mark and rating in one statement, and touches it — each is a
 * change to the shelf itself, so it belongs at the top of the list the way an image added
 * does. Correcting one *image's* rating is not, which is `updateCollectionPost`.
 */
export async function updateCollection(
  db: Db,
  id: number,
  input: CollectionInput
): Promise<CollectionOutcome<CollectionFields>> {
  const read = readCollectionFields(input)
  if ('error' in read) return { ok: false, error: read.error }

  try {
    const updated = await db<{ id: number }[]>`
      update ${db(collections)}
         set name = ${read.name}, mark = ${read.mark}, rating = ${read.rating},
             updated_at = now()
       where id = ${id}
      returning id`
    if (updated.length === 0) return { ok: false, error: 'No such collection.' }
    return { ok: true, ...read }
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
