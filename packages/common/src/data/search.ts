import type { BooruClient } from '@common/supabase/types'
import { POST_COLUMNS, type Post, type PostPage } from '@common/data/posts'
import { parseSearchQuery, resolveRatings, splitQuery, type Rating } from '@common/search'
import type { Tag } from '@common/tags'

/**
 * The search itself — the one query surface, shared by the website's listing and the
 * desktop app's browse screen. It was the web's `src/lib/data/search.ts` until the
 * desktop needed to find a post to edit; a second implementation of the grammar would
 * have meant `-tag` behaving differently depending on which window you typed it in.
 */

/**
 * The opening screenful, and the default read size for anything that doesn't say
 * otherwise. Small because it is the one read a visitor waits on with nothing on
 * screen — the feed covers the rest before they reach it.
 */
export const POSTS_PER_PAGE = 10

/**
 * What each scroll appends after that. Kept separate from the opening read even while
 * the two numbers agree: one is a cold wait, the other is prefetched ahead of the
 * viewport, so they answer to different things and get tuned apart.
 */
export const FEED_CHUNK_SIZE = 10

// PostgREST answers a request with one page of rows, so anything that has to be
// complete before it can be reasoned about — every post behind a tag — is read in
// chunks this size rather than assumed to arrive whole.
const ROWS_PER_READ = 1000

/**
 * Ids of the named tags. A name nobody has used simply has no row, so comparing the
 * result's length against `names` tells the caller whether every name resolved.
 */
async function tagIds(client: BooruClient, names: string[]): Promise<number[]> {
  if (names.length === 0) return []

  const { data, error } = await client.from('tags').select('id').in('name', names)
  if (error) throw new Error(`Tag lookup failed: ${error.message}`)
  return (data ?? []).map((row) => row.id)
}

/** Every (post, tag) link carried by the given tags, read to the end. */
async function postTagLinks(
  client: BooruClient,
  ids: number[]
): Promise<{ post_id: number; tag_id: number }[]> {
  const links: { post_id: number; tag_id: number }[] = []

  for (let from = 0; ; from += ROWS_PER_READ) {
    const { data, error } = await client
      .from('post_tags')
      .select('post_id, tag_id')
      .in('tag_id', ids)
      // A total order, not just post_id: that repeats across tags, and rows sharing a
      // sort key can shuffle between pages — read twice, or skipped entirely.
      .order('post_id', { ascending: false })
      .order('tag_id', { ascending: true })
      .range(from, from + ROWS_PER_READ - 1)
    if (error) throw new Error(`Tag link read failed: ${error.message}`)

    links.push(...(data ?? []))
    if ((data?.length ?? 0) < ROWS_PER_READ) return links
  }
}

/** Posts carrying *every* one of `names` — the AND the search bar spells with spaces. */
async function postsWithAllTags(client: BooruClient, names: string[]): Promise<number[]> {
  const ids = await tagIds(client, names)
  // One unknown name is enough: nothing can carry a tag that doesn't exist
  if (ids.length < names.length) return []

  const seenPerPost = new Map<number, Set<number>>()
  for (const link of await postTagLinks(client, ids)) {
    const seen = seenPerPost.get(link.post_id)
    if (seen) seen.add(link.tag_id)
    else seenPerPost.set(link.post_id, new Set([link.tag_id]))
  }

  return [...seenPerPost.entries()]
    .filter(([, seen]) => seen.size === ids.length)
    .map(([postId]) => postId)
}

/** Posts carrying *any* of `names` — what `-tag` takes away. */
async function postsWithAnyTag(client: BooruClient, names: string[]): Promise<number[]> {
  const ids = await tagIds(client, names)
  if (ids.length === 0) return []

  const links = await postTagLinks(client, ids)
  return [...new Set(links.map((link) => link.post_id))]
}

/**
 * What a query narrows to, once tag names are resolved: a rating whitelist and two id
 * lists. `null` back from here means the query is provably empty — a name nobody has
 * used, or an include set the excludes cancel out — and there is nothing left worth
 * asking Postgres.
 *
 * Tag membership is resolved to plain id lists first, leaving the posts request with
 * only what PostgREST does well: filter, order, count. The lists are bounded by the
 * tags' post_count, and browsing with no tags at all skips them entirely.
 */
type PostFilters = {
  allowedRatings: Rating[] | null
  onlyIds: number[] | null
  notIds: number[]
  /** The `start:` metatag, already lifted out of the query. */
  start: number | null
}

async function resolveFilters(
  client: BooruClient,
  query: string,
  visibleRatings?: readonly Rating[]
): Promise<PostFilters | null> {
  const { include, exclude, ratings, excludeRatings, start } = splitQuery(parseSearchQuery(query))
  const allowedRatings = resolveRatings({ ratings, excludeRatings }, visibleRatings)

  let onlyIds: number[] | null = null
  if (include.length > 0) {
    onlyIds = await postsWithAllTags(client, include)
    if (onlyIds.length === 0) return null
  }

  let notIds = exclude.length > 0 ? await postsWithAnyTag(client, exclude) : []
  if (onlyIds && notIds.length > 0) {
    // Both sets are already in hand, so subtract here instead of sending a second
    // id list down the wire
    const banned = new Set(notIds)
    onlyIds = onlyIds.filter((id) => !banned.has(id))
    notIds = []
    if (onlyIds.length === 0) return null
  }

  return { allowedRatings, onlyIds, notIds, start }
}

/**
 * The posts request itself, newest id first, sliced by two cursors that mean different
 * things:
 *
 * - `from` — inclusive, `id <= from`. A starting line, not a slice: it comes from the
 *   query's own `start:` metatag, and the post it names has to be first on screen.
 * - `after` — exclusive, `id < after`. Where the feed continues from, chunk to chunk.
 *
 * Both are ids rather than offsets, which is what makes an upload landing mid-scroll a
 * non-event: `id < 900` names the same rows it did a minute ago, where `offset 48`
 * quietly slides everything down one and hands you a post you already have.
 *
 * It reads one row more than it returns, and that spare row is the whole answer to "is
 * there more". Nothing here counts: `count: 'exact'` scanned the filtered set on every
 * read, and the only thing that ever needed the total was a page number.
 */
async function readPosts(
  client: BooruClient,
  filters: PostFilters,
  { perPage, from, after }: { perPage: number; from?: number; after?: number }
): Promise<PostPage> {
  let posts = client.from('posts').select(POST_COLUMNS)
  if (filters.allowedRatings) posts = posts.in('rating', filters.allowedRatings)
  if (filters.onlyIds) posts = posts.in('id', filters.onlyIds)
  if (filters.notIds.length > 0) posts = posts.not('id', 'in', `(${filters.notIds.join(',')})`)
  if (from !== undefined) posts = posts.lte('id', from)
  if (after !== undefined) posts = posts.lt('id', after)

  const { data, error } = await posts.order('id', { ascending: false }).limit(perPage + 1)
  if (error) throw new Error(`Post read failed: ${error.message}`)

  const rows = (data ?? []) as Post[]
  return { posts: rows.slice(0, perPage), hasMore: rows.length > perPage }
}

/**
 * Multi-tag search: AND over includes, NOT over excludes.
 * An empty query returns the whole gallery, so this backs plain browsing too.
 *
 * One function for both halves of the feed: no cursor is the newest screenful, the one
 * the server renders and a crawler sees; `after` is every chunk the browser appends.
 */
export async function searchPosts(
  client: BooruClient,
  {
    query = '',
    perPage = POSTS_PER_PAGE,
    after,
    visibleRatings,
  }: {
    /** Tags, rating metatags, and the `start:` cursor — the whole address of a listing. */
    query?: string
    perPage?: number
    /** Continue point: strictly older than this post. The feed's own, never in the URL. */
    after?: number
    /**
     * The tiers this caller is willing to list, as a ceiling the query narrows within.
     * Omitted means all four — the desktop app browses the whole board, and the policy
     * of which tiers a *visitor* gets belongs to the website's own wrapper, not here.
     */
    visibleRatings?: readonly Rating[]
  } = {}
): Promise<PostPage> {
  const empty: PostPage = { posts: [], hasMore: false }

  try {
    const filters = await resolveFilters(client, query, visibleRatings)
    if (!filters) return empty

    // The cursor came in inside the query; `after` is the feed's own continuation
    return await readPosts(client, filters, { perPage, from: filters.start ?? undefined, after })
  } catch (error) {
    // The grid renders empty rather than throwing, so the reason has to be logged
    console.error('searchPosts failed:', error)
    return empty
  }
}

/**
 * Tags carried by the posts currently on screen — this is what fills the tag sidebar /
 * drawer. Which tags appear is decided by the page, but the number beside each one is
 * the tag's site-wide `post_count`, the same figure the detail page and the search
 * suggestions show, so a tag doesn't read as three posts here and three hundred one
 * click later. The on-screen frequency is still counted, and still orders what comes
 * back: the sidebar keeps only the first 50, so the tags describing most of what you are
 * looking at are the ones that survive the cut. It then prints them A–Z.
 */
export async function getTagsForPosts(
  client: BooruClient,
  postIds: number[]
): Promise<{ tag: Tag; count: number }[]> {
  if (postIds.length === 0) return []

  const { data } = await client
    .from('post_tags')
    .select('tags(id, name, category, post_count)')
    .in('post_id', postIds)

  const counts = new Map<number, { tag: Tag; onPage: number }>()
  for (const row of data ?? []) {
    const tag = row.tags as unknown as Tag | null
    if (!tag) continue
    const entry = counts.get(tag.id)
    if (entry) entry.onPage += 1
    else counts.set(tag.id, { tag, onPage: 1 })
  }

  return [...counts.values()]
    .sort(
      (a, b) =>
        b.onPage - a.onPage ||
        b.tag.post_count - a.tag.post_count ||
        a.tag.name.localeCompare(b.tag.name)
    )
    .map(({ tag }) => ({ tag, count: tag.post_count }))
}
