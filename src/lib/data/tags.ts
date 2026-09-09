import 'server-only'
import { db } from '@/lib/db'
import { listTags, searchTags as sharedSearchTags } from '@common/data/shared'
import * as tags from '@common/data/tags'
import { categoryOrder, type Tag, type TagCategory } from '@common/tags'
import { TAGS_PER_PAGE } from '@/lib/tags-url'

/**
 * Tag reads, and only reads. Creating, renaming, recategorizing and deleting tags moved
 * to the desktop app with the rest of the management — `booru_web` has no write grant
 * on `tags` at all, so this half of the app could not manage the vocabulary if it tried.
 */

export async function getTagByName(name: string): Promise<Tag | null> {
  return tags.getTagByName(db(), name)
}

/** One tag by id — the tag page's own address, so a rename never breaks a link. */
export async function getTagById(id: number): Promise<Tag | null> {
  return tags.getTagById(db(), id)
}

/**
 * The whole vocabulary, most used first, held for a day.
 *
 * The /tags page reads this once and then searches, filters and pages *over the array* —
 * so a filter typed into the box and every press of Show more cost no query at all. That
 * is the trade the cache is for: a few hundred rows is a small read, and the answer only
 * moves when someone uploads or renames something in the desktop app, which the website
 * cannot be told about anyway — `booru_web` holds no write grant, so nothing here could
 * ever call a `revalidateTag`.
 *
 * The cap is the desktop tag cache's, deliberately: both are trying to hold the board's
 * whole vocabulary rather than a page of it, and a board past ten thousand tags has a
 * different problem than this page.
 *
 * A module-level `let` rather than `unstable_cache` — same reasoning as `getPostCount`,
 * where the alternative is a site-wide `cacheComponents: true`. The copy is one
 * serverless instance's, so a cold one still reads.
 *
 * `listTags` throws on a refused read, which is what the desktop wants: there it is the
 * vocabulary, and an empty list said in its place was a bug that hid for a day. A page is
 * the other case — a visitor gets more from an index that came up short than from a 500 —
 * so the throw is caught here and left in the server log, where the truth belongs. **A
 * failure is not cached**: storing it would hold the board empty for a day over one bad
 * minute.
 */
const TAG_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const TAG_CACHE_LIMIT = 10_000

let tagCache: { at: number; tags: Tag[] } | null = null

export async function getTags(): Promise<Tag[]> {
  if (tagCache && Date.now() - tagCache.at < TAG_CACHE_TTL_MS) return tagCache.tags

  try {
    const tags = await listTags(db(), TAG_CACHE_LIMIT)
    tagCache = { at: Date.now(), tags }
    return tags
  } catch (error) {
    console.error('Could not read the tags:', error instanceof Error ? error.message : error)
    return tagCache?.tags ?? []
  }
}

export type TagPage = {
  tags: Tag[]
  /** Rows the filters match, not rows returned — the table says "10 of 137". */
  total: number
  hasMore: boolean
  /** Every category the board holds, in display order, for the filter row. */
  categories: TagCategory[]
}

/**
 * The /tags table: the cached list narrowed by a name filter and a category, then cut to
 * one page.
 *
 * The order is the read's own — `post_count` first — and not the A–Z the page used to
 * sort into. That was right when the page was the whole vocabulary at once and you
 * arrived holding a name: alphabetical is how you find a name by eye. There is a filter
 * box now, which does that job better than reading down a column of five hundred, so what
 * the first ten rows should be is "the tags this board is actually made of".
 *
 * The needle matches **anywhere** in the name, where the autocomplete in
 * `@common/data/shared` matches a prefix. An autocomplete is finishing a word you have
 * started; this is looking one up, and `hair` not finding `blue_hair` is the wrong answer
 * for a box labelled with an example. Spaces are folded to underscores so the label on
 * screen can be typed back in.
 */
export async function browseTags({
  find = '',
  category = '',
  offset = 0,
  limit = TAGS_PER_PAGE,
}: {
  find?: string
  category?: string
  /** Rows already on screen. An offset rather than the feed's cursor: the page it walks
      is a snapshot held for a day, so nothing can slide underneath it mid-scroll. */
  offset?: number
  limit?: number
} = {}): Promise<TagPage> {
  const all = await getTags()
  const needle = find.trim().toLowerCase().replace(/\s+/g, '_')

  const matched = all.filter(
    (tag) =>
      (category === '' || tag.category === category) &&
      (needle === '' || tag.name.toLowerCase().includes(needle))
  )

  return {
    tags: matched.slice(offset, offset + limit),
    total: matched.length,
    hasMore: matched.length > offset + limit,
    // Drawn from every tag rather than from `matched`, so filtering to one category does
    // not leave the row with nothing to switch to but the category you are already in.
    categories: categoryOrder(all.map((t) => t.category)).filter((c) =>
      all.some((t) => t.category === c)
    ),
  }
}

/** Tag autocomplete — the query is in `@common/data/shared`, which the desktop app
 * also runs. */
export async function searchTags(query: string, limit = 8): Promise<Tag[]> {
  return sharedSearchTags(db(), query, limit)
}
