import { db } from '@/lib/db'
import * as read from '@common/data/search'
import { serving } from '@/lib/data/site'
import { logRead } from '@/lib/request-log'
import { visibleRatings } from '@/lib/nsfw-server'

/**
 * The website's half of the search: `@common/data/search` bound to this host's pool.
 * The grammar, the tag resolution and the cursor all live in there, because the desktop
 * app's browse screen runs the same query and a second implementation is how `-tag`
 * ends up meaning two things.
 */

export { POSTS_PER_PAGE, FEED_CHUNK_SIZE } from '@common/data/search'

/**
 * Every listing the website renders, including the feed's later chunks and the tag
 * page's sample. The adult tier is added here, from the request's cookie, rather than
 * by each caller: a page that forgot would show it, and the first chunk agreeing with
 * the next is not something to have to remember at four call sites.
 */
export async function searchPosts(options: Parameters<typeof read.searchPosts>[1] = {}) {
  // A closed board runs no listing. The notice is what the visitor gets either way — this
  // is what stops the search from running underneath it; see `serving()`.
  if (!(await serving())) return { posts: [], hasMore: false }

  const started = Date.now()
  const page = await read.searchPosts(db(), {
    ...options,
    visibleRatings: await visibleRatings(),
  })

  // The one read worth naming its caller: it runs on every listing, every feed chunk and
  // every tag sample, and `kind=action` is the half no page render accounts for.
  await logRead('search', {
    q: options.query ?? '',
    after: options.after,
    n: options.perPage,
    rows: page.posts.length,
    ms: Date.now() - started,
  })

  return page
}

/**
 * Prev/next for the detail page, filtered by the same search the visitor is inside and
 * the same tiers this browser lists — so the walk cannot step onto a post the listing
 * would not have shown, and cannot step out of the search that led here.
 */
export async function getSearchNeighbours(options: { id: number; query?: string }) {
  // The arrows simply aren't there, which is what they already do on a failed read.
  if (!(await serving())) return { prevId: null, nextId: null }

  return read.searchNeighbours(db(), {
    ...options,
    visibleRatings: await visibleRatings(),
  })
}

export async function getTagsForPosts(postIds: number[]) {
  if (!(await serving())) return []

  const started = Date.now()
  const entries = await read.getTagsForPosts(db(), postIds)

  // Logged beside the search because it is the listing's *other* read and the one that
  // actually moves bytes — a screenful of posts can carry several hundred tag rows.
  await logRead('facets', {
    posts: postIds.length,
    rows: entries.length,
    ms: Date.now() - started,
  })

  return entries
}
