/**
 * What a collection is, spelled once — the tables it lives in, the addresses it takes on
 * the website, and what counts as a name.
 *
 * A collection is a named set of images that are **not posts**. They carry no tags, they
 * are never searched, each one belongs to exactly one collection, and none of them appear
 * in either gallery. That is the whole point: the board is a tag vocabulary, and an image
 * nobody would file under a tag — the one-off, the niche piece, the thing that only makes
 * sense beside the four others it came with — dilutes every tag it is given. A shelf is a
 * better answer than a bad tag.
 *
 * **So it is not a third `Board`.** `@common/board` is a lookup of three table names per
 * board, two of which are about tags, and a `BOARD.collection` entry would have carried a
 * `postTags` and a `tagCount` that every read, every counter and every facet would then
 * have to test for — and a `path` the search grammar could address, which is the one thing
 * this section must not be. The two boards are one page twice because a generated image
 * *is* a post; a collection is a different shape, so it gets its own small set of reads
 * (`@common/data/collections`) and its own three routes.
 *
 * Nothing here imports anything, the way `@common/board` doesn't, so it can sit under
 * `@common/storage` without a cycle.
 */

/**
 * The two tables, spelled here and interpolated as identifiers by
 * `@common/data/collections` — the same rule invariant 10 makes of the boards, for the
 * same reason. A table name written into a query is a table name that can be typed wrong.
 */
export const COLLECTION_TABLES = {
  collections: 'collections',
  posts: 'collection_posts',
} as const

/**
 * Object prefixes, beside the boards' under one bucket. A collection's images are not
 * filed per collection — `collections/posts/<md5>.<ext>` and not
 * `collections/<id>/posts/…` — because `collection_posts.file_name` is unique across the
 * whole table: an image is in exactly one collection, so its name already identifies it,
 * and a per-collection folder would mean that moving a row between shelves moved two
 * stored objects with it.
 */
export const COLLECTION_POST_PREFIX = 'collections/posts'
export const COLLECTION_THUMB_PREFIX = 'collections/thumbs'

/** Where the shelf lives on the website. The only place this path is spelled, the way
 *  `searchHref` is the only place `/posts` is. */
export const COLLECTIONS_PATH = '/collections'

export function collectionsHref(): string {
  return COLLECTIONS_PATH
}

/** One collection's contents. */
export function collectionHref(id: number): string {
  return `${COLLECTIONS_PATH}/${id}`
}

/**
 * One image in it. Nested under the collection rather than addressed on its own, because a
 * collection post has no existence outside its shelf — the page's way back, its heading
 * and its prev/next walk are all that collection's, and a flat `/collection-posts/<id>`
 * would have to read the row before it could say where "back" went.
 */
export function collectionPostHref(collectionId: number, postId: number): string {
  return `${COLLECTIONS_PATH}/${collectionId}/${postId}`
}

/** As long a name as the shelf card can draw without wrapping to three lines. */
export const COLLECTION_NAME_MAX = 64

/** The one control character above the space, which a regex range would have to spell
 *  as an escape — every other one is simply anything below `' '`. */
const DEL = '\u007f'

/**
 * A collection's name, as it will be stored, or why it cannot be.
 *
 * Prose, not a tag: a person names a shelf `Ukiyo-e studies`, with the capital and the
 * hyphen and the space. So the rules are only the ones a stored name genuinely needs —
 * trimmed, inner whitespace collapsed to single spaces (so two names cannot differ by an
 * invisible run of them), no control characters, and a length. Case is kept as typed and
 * ignored for uniqueness, which the unique index on `lower(name)` does: `Sketches` and
 * `sketches` are one shelf spelled two ways, and refusing the second is the useful answer.
 *
 * Shaped like `readTagName` (`@common/data/tags`) — a value or a sentence — because both
 * are read by an IPC handler whose job is to show that sentence to whoever typed it.
 */
export function readCollectionName(raw: string): { name: string } | { error: string } {
  const cleaned = [...raw]
    .map((ch) => (ch < ' ' || ch === DEL ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return { error: 'Type a name for the collection.' }
  if (cleaned.length > COLLECTION_NAME_MAX) {
    return { error: `That name is too long (max ${COLLECTION_NAME_MAX} characters).` }
  }
  return { name: cleaned }
}
