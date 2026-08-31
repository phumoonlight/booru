import { createClient, type ServerClient } from '@/lib/supabase/server'
import { POST_COLUMNS, type Post, type PostPage } from '@/lib/data/posts'
import type { Tag } from '@/lib/tags'
import { parseSearchQuery, RATINGS, resolveRatings, splitRatings, type Rating } from '@/lib/search'

export const POSTS_PER_PAGE = 24

// PostgREST answers a request with one page of rows, so anything that has to be
// complete before it can be reasoned about — every post behind a tag — is read in
// chunks this size rather than assumed to arrive whole.
const ROWS_PER_READ = 1000

/**
 * Ids of the named tags. A name nobody has used simply has no row, so comparing the
 * result's length against `names` tells the caller whether every name resolved.
 */
async function tagIds(supabase: ServerClient, names: string[]): Promise<number[]> {
  if (names.length === 0) return []

  const { data, error } = await supabase.from('tags').select('id').in('name', names)
  if (error) throw new Error(`Tag lookup failed: ${error.message}`)
  return (data ?? []).map((row) => row.id)
}

/** Every (post, tag) link carried by the given tags, read to the end. */
async function postTagLinks(
  supabase: ServerClient,
  ids: number[]
): Promise<{ post_id: number; tag_id: number }[]> {
  const links: { post_id: number; tag_id: number }[] = []

  for (let from = 0; ; from += ROWS_PER_READ) {
    const { data, error } = await supabase
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
async function postsWithAllTags(supabase: ServerClient, names: string[]): Promise<number[]> {
  const ids = await tagIds(supabase, names)
  // One unknown name is enough: nothing can carry a tag that doesn't exist
  if (ids.length < names.length) return []

  const seenPerPost = new Map<number, Set<number>>()
  for (const link of await postTagLinks(supabase, ids)) {
    const seen = seenPerPost.get(link.post_id)
    if (seen) seen.add(link.tag_id)
    else seenPerPost.set(link.post_id, new Set([link.tag_id]))
  }

  return [...seenPerPost.entries()]
    .filter(([, seen]) => seen.size === ids.length)
    .map(([postId]) => postId)
}

/** Posts carrying *any* of `names` — what `-tag` takes away. */
async function postsWithAnyTag(supabase: ServerClient, names: string[]): Promise<number[]> {
  const ids = await tagIds(supabase, names)
  if (ids.length === 0) return []

  const links = await postTagLinks(supabase, ids)
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
}

async function resolveFilters(
  supabase: ServerClient,
  query: string
): Promise<PostFilters | null> {
  const { include, exclude, ratings, excludeRatings } = splitRatings(parseSearchQuery(query))
  const allowedRatings = resolveRatings({ ratings, excludeRatings })

  let onlyIds: number[] | null = null
  if (include.length > 0) {
    onlyIds = await postsWithAllTags(supabase, include)
    if (onlyIds.length === 0) return null
  }

  let notIds = exclude.length > 0 ? await postsWithAnyTag(supabase, exclude) : []
  if (onlyIds && notIds.length > 0) {
    // Both sets are already in hand, so subtract here instead of sending a second
    // id list down the wire
    const banned = new Set(notIds)
    onlyIds = onlyIds.filter((id) => !banned.has(id))
    notIds = []
    if (onlyIds.length === 0) return null
  }

  return { allowedRatings, onlyIds, notIds }
}

/**
 * The posts request itself, newest id first. Two ways to ask for a slice of it:
 *
 * - `page` — offset paging, and the only mode that pays for `count: 'exact'`, because
 *   a page *number* is meaningless without knowing how many there are.
 * - `beforeId` — keyset paging, what the feed appends with. It costs no count, and it
 *   cannot skip or repeat a post when an upload lands mid-scroll: `id < cursor` still
 *   names the same rows it did a minute ago, where `offset 48` quietly slides.
 */
async function readPosts(
  supabase: ServerClient,
  filters: PostFilters,
  { perPage, page, beforeId }: { perPage: number; page?: number; beforeId?: number }
): Promise<{ posts: Post[]; total: number }> {
  const wantsTotal = page !== undefined

  let posts = supabase.from('posts').select(POST_COLUMNS, {
    count: wantsTotal ? 'exact' : undefined,
  })
  if (filters.allowedRatings) posts = posts.in('rating', filters.allowedRatings)
  if (filters.onlyIds) posts = posts.in('id', filters.onlyIds)
  if (filters.notIds.length > 0) posts = posts.not('id', 'in', `(${filters.notIds.join(',')})`)
  if (beforeId !== undefined) posts = posts.lt('id', beforeId)

  const from = page !== undefined ? (page - 1) * perPage : 0
  const { data, count, error } = await posts
    .order('id', { ascending: false })
    .range(from, from + perPage - 1)
  if (error) throw new Error(`Post read failed: ${error.message}`)

  // `count: 'exact'` counts the filtered set, not the page — what page numbers need
  return { posts: (data ?? []) as Post[], total: count ?? 0 }
}

/**
 * Multi-tag search: AND over includes, NOT over excludes.
 * An empty query returns the whole gallery, so this backs plain browsing too.
 * Ratings narrow only when the query says so — nothing is hidden by default.
 *
 * This is the first screenful — the one the server renders and a crawler sees.
 * `searchPostsAfter` continues it.
 */
export async function searchPosts({
  query = '',
  page = 1,
  perPage = POSTS_PER_PAGE,
}: {
  query?: string
  page?: number
  perPage?: number
} = {}): Promise<PostPage> {
  const empty: PostPage = { posts: [], total: 0, page, pageCount: 0 }

  try {
    const supabase = await createClient()
    const filters = await resolveFilters(supabase, query)
    if (!filters) return empty

    const { posts, total } = await readPosts(supabase, filters, { perPage, page })
    return { posts, total, page, pageCount: Math.ceil(total / perPage) }
  } catch (error) {
    // The grid renders empty rather than throwing, so the reason has to be logged
    console.error('searchPosts failed:', error)
    return empty
  }
}

/**
 * The chunk after a post already on screen — what the feed asks for as you scroll.
 *
 * It reads one row more than it returns, and that spare row is the whole answer to
 * "is there more": a second query counting the rest would cost a full scan of the
 * filtered set on every chunk, to render one button.
 */
export async function searchPostsAfter({
  query = '',
  beforeId,
  perPage = POSTS_PER_PAGE,
}: {
  query?: string
  beforeId: number
  perPage?: number
}): Promise<{ posts: Post[]; hasMore: boolean }> {
  const empty = { posts: [], hasMore: false }

  try {
    const supabase = await createClient()
    const filters = await resolveFilters(supabase, query)
    if (!filters) return empty

    const { posts } = await readPosts(supabase, filters, { perPage: perPage + 1, beforeId })
    return { posts: posts.slice(0, perPage), hasMore: posts.length > perPage }
  } catch (error) {
    console.error('searchPostsAfter failed:', error)
    return empty
  }
}

/** Autocomplete source: prefix match on tag name, most-used first. */
export async function searchTags(prefix: string, limit = 10): Promise<Tag[]> {
  const term = prefix.trim().toLowerCase()
  if (!term) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('tags')
    .select('id, name, category, post_count')
    // Escape PostgREST pattern wildcards so a literal % or _ can't widen the match
    .ilike('name', `${term.replace(/[%_]/g, '\\$&')}%`)
    .order('post_count', { ascending: false })
    .order('name')
    .limit(limit)

  return data ?? []
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
export async function getTagsForPosts(postIds: number[]): Promise<{ tag: Tag; count: number }[]> {
  if (postIds.length === 0) return []

  const supabase = await createClient()
  const { data } = await supabase
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

/**
 * Site-wide post count per rating — the whole gallery, not the page on screen, so the
 * rating facet reads like a tag's `post_count`: a fixed scale whose numbers stay put as
 * you page through or narrow the search. `rating_counts` is a denormalized counter row
 * per tier, recomputed by the write path (lib/data/counters.ts), so this is a six-row
 * read, not six `count(*)` scans.
 */
export async function getRatingCounts(): Promise<Record<Rating, number>> {
  const supabase = await createClient()
  const { data } = await supabase.from('rating_counts').select('rating, post_count')

  const counts = Object.fromEntries(RATINGS.map((rating) => [rating, 0])) as Record<Rating, number>
  for (const row of data ?? []) {
    // `rating` is free-form text in the DB; the sidebar only renders the known scale
    if (row.rating in counts) counts[row.rating as Rating] = row.post_count
  }
  return counts
}
