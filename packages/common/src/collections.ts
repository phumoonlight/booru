/**
 * What a collection is, spelled once — the tables it lives in, the addresses it takes on
 * the website, the list's search and a shelf's tag filter as a URL carries them, and what
 * counts as a name, a mark and a tag.
 *
 * A collection is a named set of images, and since the boards were dropped (0012) it is
 * what the site is made of. Each image belongs to exactly one shelf, takes that shelf's
 * rating, and carries whichever of that shelf's own tags (0013) have been put on it.
 *
 * It imports `@common/search`'s rating vocabulary and `@common/tags`'s `parseTagInput`,
 * neither of which imports anything, so it can sit under `@common/storage` without a
 * cycle.
 */

import { asRating, RATING_NAME, type Rating } from '@common/search'
import { markColor, parseTagInput } from '@common/tags'

/**
 * The two tables, spelled here and interpolated as identifiers by
 * `@common/data/collections` — invariant 10. A table name written into a query is a table
 * name that can be typed wrong.
 */
export const COLLECTION_TABLES = {
  collections: 'collections',
  posts: 'collection_posts',
  /** A shelf's own words (0013), which are not the board-wide `tags` vocabulary — see the
   *  migration for why those two are different tables and not one. */
  tags: 'collection_tags',
  postTags: 'collection_post_tags',
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

/**
 * The parameter a shelf's own page takes, and the only one it takes: the tags an image
 * must carry to be drawn. Space-separated, which `URLSearchParams` writes as `+` —
 * `?tags=blue_hair+landscape`.
 */
export const COLLECTION_TAG_PARAM = 'tags'

/**
 * One collection's contents, narrowed to the images carrying **every** one of `tags`.
 *
 * AND rather than OR, which is what a pill bar is for: each pill you add is a further
 * question about the same image, and a set that grows as you narrow it would be the one
 * thing a filter must not do. Names are written as typed — they are already normalized by
 * `readCollectionTagName` on the way into the table, so the URL and the row agree.
 */
export function collectionHref(id: number, tags: readonly string[] = []): string {
  if (tags.length === 0) return `${COLLECTIONS_PATH}/${id}`
  const params = new URLSearchParams({ [COLLECTION_TAG_PARAM]: tags.join(' ') })
  return `${COLLECTIONS_PATH}/${id}?${params}`
}

/** As many tags as a shelf's URL may name. A bound rather than a belief: the parameter
 *  arrives from the open web and becomes a condition per name in one query. */
export const COLLECTION_TAG_FILTER_MAX = 16

/**
 * The tags a shelf page's `searchParams` carry, as names. Loose the way
 * `readCollectionFilter` is: a token that could not be a tag name is dropped rather than
 * refusing the page, since the only thing on the other side of a hand-edited URL is an
 * image grid.
 */
export function readCollectionTags(
  params: Record<string, string | string[] | undefined>
): string[] {
  const raw = params[COLLECTION_TAG_PARAM]
  const value = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.join(' ') : ''
  return parseTagInput(value).tags.slice(0, COLLECTION_TAG_FILTER_MAX)
}

/**
 * `tags` with `name` taken out if it is there and added if it is not — what one press on a
 * pill means, for the href that press is.
 *
 * Here rather than in the component drawing the pills so that the website and the desktop
 * app agree about what a pill does, and so the address a pill points at is still spelled in
 * the one module that spells a collection's addresses (invariant 8).
 */
export function toggleCollectionTag(tags: readonly string[], name: string): string[] {
  return tags.includes(name) ? tags.filter((tag) => tag !== name) : [...tags, name]
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

/** As long a tag as the pill bar can draw, and the same cap `readTagName` puts on the
 *  board-wide vocabulary. */
export const COLLECTION_TAG_MAX = 64

/**
 * A shelf's tag name, as it will be stored, or why it cannot be.
 *
 * A token and not prose, which is the one place a tag differs from the shelf it is on: a
 * name is read as a title, where a tag is typed, filtered on and carried in a URL. So it
 * goes through `parseTagInput` — the same lowercasing and the same character rule the
 * board-wide vocabulary uses.
 *
 * **A space inside the name becomes `_`**, and a run of them one `_`; spaces at either end
 * are trimmed. `after sex` is one tag somebody typed the natural way, and refusing it for
 * the separator the grammar happens to spell differently was an error with an obvious fix
 * the field could make itself.
 *
 * Shaped like `readCollectionName` and `readTagName`: a value, or a sentence for whoever
 * typed it.
 */
export function readCollectionTagName(raw: string): { name: string } | { error: string } {
  if (raw.length > COLLECTION_TAG_MAX) {
    return { error: `That tag is too long — ${COLLECTION_TAG_MAX} characters at most.` }
  }

  const { tags, invalid } = parseTagInput(raw.trim().replace(/\s+/g, '_'))
  if (invalid.length > 0) {
    return { error: `“${invalid[0]}” can only use lowercase letters, digits and _ ( ) . -` }
  }
  if (tags.length === 0) return { error: 'Type a tag.' }
  return { name: tags[0] }
}

/**
 * What is drawn in front of a shelf tag's name, as it will be stored — null for none.
 *
 * Both of the marks this project already has, in one box. **A colour is taken first**,
 * lowercased, and painted as a dot — `markColor` is the test the pill will apply, so what is
 * accepted as a colour here is exactly what will paint as one. Anything else is text, held
 * to the rules a shelf's own mark is (`readCollectionMark`): an emoji, `[WIP]`, `2024`.
 * Not `readTagMark`'s emoji-only rule, since a prefix of words is half of what this is for.
 */
export function readCollectionTagMark(raw: string): { mark: string | null } | { error: string } {
  const color = markColor(raw)
  if (color) return { mark: color }
  return readCollectionMark(raw)
}
