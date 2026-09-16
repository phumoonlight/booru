import {
  COLLECTION_TABLES,
  readCollectionTagMark,
  readCollectionTagName,
} from '@common/collections'
import { isUniqueViolation, type Db } from '@common/db'
import type { CollectionOutcome } from '@common/data/collections-write'

/**
 * A shelf's tags, from the side that writes them: make one, rename one, delete one, and
 * put one on or take one off a set of the shelf's images.
 *
 * **A tag is made before it is used, and only on its own shelf.** Putting a tag on an image
 * takes the tag's *id*, never a name, so no write here can coin one from a typo — the rule
 * invariant 6 keeps for the board-wide vocabulary, kept for these too. And every statement
 * that links a tag to an image checks that both are on the same shelf, in the statement,
 * since both ids arrive from a window that could be holding a stale screen.
 *
 * **None of these touches the shelf.** The list is ordered by what has happened to a
 * shelf's contents — an image added, removed or moved — and a tag is a word *about* those
 * images, the way a source is. A shelf being tidied should not jump to the top of the list
 * every time a pill is pressed.
 *
 * That is also what keeps every one of these a single statement, so each takes a `Db`
 * (invariant 5) and none needs the pool.
 */

const { posts, tags, postTags } = COLLECTION_TABLES

/** A shelf tag as typed into the desktop form: a name, and a mark that may be empty. */
export type CollectionTagInput = { name: string; mark: string }

type CollectionTagFields = { name: string; mark: string | null }

/** The name and the mark settled together, so a form with both wrong says the first. */
function readCollectionTagFields(input: CollectionTagInput): CollectionTagFields | { error: string } {
  const name = readCollectionTagName(input.name)
  if ('error' in name) return name
  const mark = readCollectionTagMark(input.mark)
  if ('error' in mark) return mark
  return { name: name.name, mark: mark.mark }
}

/** A new tag on one shelf. A duplicate there is the one failure worth wording, caught
 *  rather than asked about first — the unique index is what actually decides. */
export async function createCollectionTag(
  db: Db,
  collectionId: number,
  input: CollectionTagInput
): Promise<CollectionOutcome<{ id: number } & CollectionTagFields>> {
  const read = readCollectionTagFields(input)
  if ('error' in read) return { ok: false, error: read.error }

  try {
    const [row] = await db<{ id: number }[]>`
      insert into ${db(tags)} (collection_id, name, mark)
      values (${collectionId}, ${read.name}, ${read.mark})
      returning id`
    return { ok: true, id: row.id, ...read }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: `This collection already has ${read.name}.` }
    }
    throw error
  }
}

/** Rewrites a tag's name and mark in place. Its id is kept, so every image carrying it
 *  still does. A name the shelf already has is refused rather than merged into — see
 *  `renameTag`. */
export async function updateCollectionTag(
  db: Db,
  id: number,
  input: CollectionTagInput
): Promise<CollectionOutcome<CollectionTagFields>> {
  const read = readCollectionTagFields(input)
  if ('error' in read) return { ok: false, error: read.error }

  try {
    const [row] = await db<{ id: number }[]>`
      update ${db(tags)} set name = ${read.name}, mark = ${read.mark}
       where id = ${id} returning id`
    if (!row) return { ok: false, error: 'No such tag.' }
    return { ok: true, ...read }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: `This collection already has ${read.name}.` }
    }
    throw error
  }
}

/** Deletes a tag, and with it every image's copy of it — `collection_post_tags` cascades.
 *  The images themselves are untouched. */
export async function deleteCollectionTag(db: Db, id: number): Promise<CollectionOutcome> {
  const gone = await db`delete from ${db(tags)} where id = ${id}`
  return gone.count > 0 ? { ok: true } : { ok: false, error: 'No such tag.' }
}

/**
 * Puts one tag on a set of images, or takes it off, answering with how many changed.
 *
 * A set rather than one image because it serves both the image panel (a set of one) and
 * 🗂️ Manage's selection, where forty images tagged as forty statements would be forty round
 * trips to say one thing.
 *
 * **Only images on the tag's own shelf are linked.** The insert selects its rows through a
 * join that requires it, so an id from another shelf is skipped rather than written — a tag
 * from shelf A on an image of shelf B would be a word nobody can see, since B's pill bar
 * does not have it.
 *
 * `on conflict do nothing` for an image that already carries it. The aside invariant 6
 * makes about that clause spending identity values does not apply: this table's key is the
 * pair, and it has no identity column to spend.
 */
export async function setCollectionPostsTag(
  db: Db,
  { tagId, postIds, on }: { tagId: number; postIds: number[]; on: boolean }
): Promise<CollectionOutcome<{ changed: number }>> {
  if (postIds.length === 0) return { ok: true, changed: 0 }

  if (!on) {
    const gone = await db`
      delete from ${db(postTags)}
       where tag_id = ${tagId} and post_id = any(${postIds}::int[])`
    return { ok: true, changed: gone.count }
  }

  const added = await db`
    insert into ${db(postTags)} (post_id, tag_id)
    select p.id, t.id
      from ${db(posts)} p
      join ${db(tags)} t on t.collection_id = p.collection_id
     where t.id = ${tagId} and p.id = any(${postIds}::int[])
    on conflict do nothing`
  return { ok: true, changed: added.count }
}
