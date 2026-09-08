import { cache } from 'react'
import { db } from '@/lib/db'
import * as read from '@common/data/posts'

/**
 * The website's post reads: `@common/data/posts` bound to this host's pool.
 *
 * There is one handle now, where there were two clients — a cookie-less anon one for
 * every read and a service-role one for the view counter. Every read is the same read
 * for everybody, which is also why `cache()` below is safe: nothing it memoizes depends
 * on who is asking.
 */

export type { Post, PostPage } from '@common/data/posts'

// Browse listings go through searchPosts() in lib/data/search.ts — an empty query
// returns the whole gallery.

/**
 * How many posts the board holds. Counted head-only, so no rows cross the wire —
 * the landing page shows the number and nothing else about them.
 */
export async function getPostCount(): Promise<number> {
  return read.getPostCount(db())
}

// Cached because the post page and its generateMetadata both need the same rows
export const getPost = cache((id: number) => read.getPost(db(), id))

export const getPostTags = cache((postId: number) => read.getPostTags(db(), postId))

export async function getPostTagNames(postId: number): Promise<string[]> {
  const tags = await getPostTags(postId)
  return tags.map((t) => t.name)
}

/** Adjacent post ids for prev/next navigation on the detail page. */
export async function getPostNeighbours(id: number) {
  return read.getPostNeighbours(db(), id)
}

/** Ids + dates of indexable posts, newest first — the sitemap's source. */
export async function getSitemapPosts(limit: number) {
  return read.getSitemapPosts(db(), limit)
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
export async function incrementPostView(postId: number): Promise<void> {
  await db()`update posts set view_count = view_count + 1 where id = ${postId}`
}
