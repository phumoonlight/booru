/**
 * What a collection is, spelled once — the tables it lives in, the addresses it takes on
 * the website, the list's search as a URL carries it, and what counts as a name and a mark.
 *
 * A collection is a named set of images, and since the boards were dropped (0012) it is
 * what the site is made of. Its images carry no tags; each belongs to exactly one shelf and
 * takes that shelf's rating.
 *
 * It imports only `@common/search`'s rating vocabulary, which imports nothing, so it can
 * sit under `@common/storage` without a cycle.
 */

import { asRating, RATING_NAME, type Rating } from '@common/search'

/**
 * The two tables, spelled here and interpolated as identifiers by
 * `@common/data/collections` — invariant 10. A table name written into a query is a table
 * name that can be typed wrong.
 */
export const COLLECTION_TABLES = {
  collections: 'collections',
  posts: 'collection_posts',
} as const

/**
 * Object prefixes, under the one bucket. A collection's images are not
 * filed per collection — `collections/posts/<md5>.<ext>` and not
 * `collections/<id>/posts/…` — because `collection_posts.file_name` is unique across the
 * whole table: an image is in exactly one collection, so its name already identifies it,
 * and a per-collection folder would mean that moving a row between shelves moved two
 * stored objects with it.
 */
export const COLLECTION_POST_PREFIX = 'collections/posts'
export const COLLECTION_THUMB_PREFIX = 'collections/thumbs'

/** Where the shelf list lives on the website. The only place this path is spelled. */
export const COLLECTIONS_PATH = '/collections'

/**
 * The shelf list's search, as its URL carries it: `?q=` a piece of the name, `?rating=`
 * a tier by its query name (`general`, `r18`), `?ai=1` or `?ai=0`. Spelled here and read
 * back by `readCollectionFilter`, so the form that writes them and the page that reads them
 * cannot disagree.
 */
export const COLLECTION_FILTER_PARAMS = { name: 'q', rating: 'rating', ai: 'ai' } as const

export type CollectionListFilter = { name?: string; rating?: Rating; isAi?: boolean }

/** The shelf list, narrowed by `filter` — every field optional, an empty one left out. */
export function collectionsHref(filter: CollectionListFilter = {}): string {
  const params = new URLSearchParams()
  const name = filter.name?.trim()
  if (name) params.set(COLLECTION_FILTER_PARAMS.name, name)
  if (filter.rating) params.set(COLLECTION_FILTER_PARAMS.rating, RATING_NAME[filter.rating])
  if (filter.isAi !== undefined) params.set(COLLECTION_FILTER_PARAMS.ai, filter.isAi ? '1' : '0')
  const query = params.toString()
  return query ? `${COLLECTIONS_PATH}?${query}` : COLLECTIONS_PATH
}

/**
 * The filter a page's `searchParams` carry. Loose on the way in, as `asRating` is: a
 * value it does not recognise is dropped rather than refused, so a hand-edited URL costs
 * that one filter and never the page.
 */
export function readCollectionFilter(
  params: Record<string, string | string[] | undefined>
): CollectionListFilter {
  const one = (key: string) => {
    const raw = params[key]
    return typeof raw === 'string' ? raw.trim() : ''
  }
  const name = one(COLLECTION_FILTER_PARAMS.name).slice(0, COLLECTION_NAME_MAX)
  const rating = asRating(`rating:${one(COLLECTION_FILTER_PARAMS.rating)}`) ?? undefined
  const ai = one(COLLECTION_FILTER_PARAMS.ai)
  return {
    ...(name ? { name } : {}),
    ...(rating ? { rating } : {}),
    ...(ai === '1' || ai === '0' ? { isAi: ai === '1' } : {}),
  }
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

/** Graphemes, not characters: a mark is usually an emoji, and 🧑‍🎨 is five UTF-16 units. */
export const COLLECTION_MARK_MAX = 12

/**
 * The prefix drawn in front of a collection's name, as it will be stored — null for none.
 *
 * Anything a person would type there, unlike `readTagMark`: a shelf's mark is not a colour
 * and not bound to emoji, since `[WIP]` or a year says something a glyph cannot. Only what
 * the name gets — control characters out, whitespace collapsed — and a length, refused
 * rather than truncated for the reason a tag's mark is.
 */
export function readCollectionMark(raw: string): { mark: string | null } | { error: string } {
  const cleaned = [...raw]
    .map((ch) => (ch < ' ' || ch === DEL ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return { mark: null }
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const graphemes = [...segmenter.segment(cleaned)]
  if (graphemes.length > COLLECTION_MARK_MAX) {
    return { error: `A mark is ${COLLECTION_MARK_MAX} characters at most.` }
  }
  return { mark: cleaned }
}
