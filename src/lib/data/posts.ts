import { cache } from 'react'
import { BOARD, BOARDS, type Board } from '@common/board'
import { db } from '@/lib/db'
import { serving } from '@/lib/data/site'
import * as read from '@common/data/posts'

/**
 * The website's post reads: `@common/data/posts` bound to this host's pool.
 *
 * There is one handle now, where there were two clients — a cookie-less anon one for
 * every read and a service-role one for the view counter. Every read is the same read
 * for everybody, which is also why `cache()` below is safe: nothing it memoizes depends
 * on who is asking — the board a row came from is part of the key, so `#12` on the two
 * boards are two different memos of two different rows.
 */

export type { Post, PostPage } from '@common/data/posts'

// Browse listings go through searchPosts() in lib/data/search.ts — an empty query
// returns the whole gallery.

/**
 * The landing page's count, held for five minutes.
 *
 * `count(*)` has no shortcut in Postgres — it scans every row, and gets linearly slower
 * as the board fills. Neon amplifies that: the compute reads its pages over the network
 * from the pageserver, so a scan over anything not in the local cache pays a round trip
 * per batch, and the first read after a scale-to-zero wake pays all of them. None of
 * which the visitor should be waiting on for a number under a search box.
 *
 * The window is what makes the board's size stop mattering: however much traffic `/`
 * takes, the query runs at most 288 times a day.
 *
 * A module-level `let` rather than `unstable_cache` — which is deprecated in Next 16,
 * replaced by `use cache`, which in turn needs `cacheComponents: true`, which is a
 * site-wide opt-in: the NSFW cookie is read down in `lib/data/search.ts`, so every
 * listing is cookie-dependent and would need Suspense boundaries before the build
 * passed. That is the right migration to make for its own reasons and the wrong one to
 * make for this. What a plain `let` costs is that the copy is one serverless instance's,
 * so a cold one still queries — the same trade `main/tag-cache.ts` takes in the desktop.
 */
const COUNT_TTL_MS = 5 * 60 * 1000

// One window per board. They are two scans of two tables answering two questions, and
// sharing a slot would have meant whichever page asked first deciding what the other one
// said for the next five minutes.
const countCache: Partial<Record<Board, { at: number; count: number }>> = {}

/**
 * How many posts a board holds. Counted head-only, so no rows cross the wire —
 * the landing page shows the number and nothing else about them.
 */
export async function getPostCount(board: Board = 'post'): Promise<number> {
  // The landing page is behind the notice too, so nobody is waiting on this number.
  // Checked before the window is consulted, so a closed board neither reads nor caches.
  if (!(await serving())) return 0

  const held = countCache[board]
  if (held && Date.now() - held.at < COUNT_TTL_MS) return held.count
  const count = await read.getPostCount(db(), board)
  countCache[board] = { at: Date.now(), count }
  return count
}

// Cached because the post page and its generateMetadata both need the same rows.
// `generateMetadata` is the half that made this worth guarding twice over: it runs for a
// route the maintenance notice has replaced, so a closed board was still reading a post
// and its tags to title a page nobody was being shown.
export const getPost = cache(async (id: number, board: Board = 'post') =>
  (await serving()) ? read.getPost(db(), id, board) : null
)

export const getPostTags = cache(async (postId: number, board: Board = 'post') =>
  (await serving()) ? read.getPostTags(db(), postId, board) : []
)

export async function getPostTagNames(postId: number, board: Board = 'post'): Promise<string[]> {
  const tags = await getPostTags(postId, board)
  return tags.map((t) => t.name)
}

/**
 * Ids + dates of indexable posts, newest first — the sitemap's source.
 *
 * **The one read with no `serving()` guard**, deliberately: `sitemap.xml` and
 * `robots.txt` sit outside the maintenance gate because they are what a crawler reads to
 * decide whether to come back, and answering them with nothing during an hour of
 * maintenance is a way to be dropped from an index over something temporary. It is also
 * the cheap one to leave open — an hourly ISR route rather than a query per visit.
 */
export async function getSitemapPosts(limit: number, board: Board = 'post') {
  return read.getSitemapPosts(db(), limit, board)
}

/**
 * Adds one view to a post — the only write the website makes.
 *
 * **It is one statement again.** This was `increment_post_view` in plpgsql, then a
 * read-then-write with a three-attempt compare-and-swap standing in for the atomicity
 * the function had for free — because PostgREST cannot send `view_count = view_count +
 * 1`, and an increment that loses a race is wrong for good. Under contention that loop
 * gave up and dropped the view; `+ 1` in the database neither loses nor gives up.
 *
 * `tags.post_count` still recounts rather than increments
 * (packages/common/src/data/counters.ts). That is not inconsistency: a tag's count is
 * derived from rows that exist, so it can be recomputed and repaired, and `view_count`
 * is derived from nothing — the rows that would define it are never stored, so the
 * increment *is* the record.
 *
 * `booru_web` holds `update (view_count) on posts` and no other write grant anywhere, so
 * a stray update to any other column is refused by the database rather than by this
 * function remembering not to make one. Nothing but an id reaches here.
 */
export async function incrementPostView(postId: number, board: Board = 'post'): Promise<void> {
  // A post nobody was shown was not viewed. `PostViewCounter` never mounts behind the
  // notice, so this is belt and braces — but it is also the only write the site makes,
  // and a closed board making one is the thing worth being sure about.
  if (!(await serving())) return

  // The board arrives from an action, so it is checked against the list rather than
  // trusted: `BOARD[board]` on anything else is `undefined`, and an undefined table name
  // is not a query this should be sending. `booru_web` holds `update (view_count)` on
  // both post tables and nothing else anywhere, so the grant is still the real boundary.
  if (!(BOARDS as readonly string[]).includes(board)) return

  const sql = db()
  await sql`
    update ${sql(BOARD[board].posts)}
       set view_count = view_count + 1
     where id = ${postId}`
}
