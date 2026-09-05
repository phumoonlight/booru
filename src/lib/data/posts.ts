import { cache } from 'react'
import { createAnonClient } from '@/lib/supabase/anon'
import { createAdminClient } from '@/lib/supabase/admin'
import * as read from '@common/data/posts'

/**
 * The website's post reads: `@common/data/posts` bound to the anon client.
 *
 * There is one read client now. There used to be two — a request-scoped one that
 * carried the visitor's session cookies, and this cookie-less one for routes that had
 * to stay cacheable — and with the accounts gone there is no session for a cookie to
 * hold. Every read is the same read for everybody, which is also why `cache()` below is
 * safe: nothing it memoizes depends on who is asking.
 */

export type { Post, PostPage } from '@common/data/posts'
export { POST_COLUMNS } from '@common/data/posts'

// Browse listings go through searchPosts() in lib/data/search.ts — an empty query
// returns the whole gallery.

/**
 * How many posts the board holds. Counted head-only, so no rows cross the wire —
 * the landing page shows the number and nothing else about them.
 */
export async function getPostCount(): Promise<number> {
  return read.getPostCount(createAnonClient())
}

// Cached because the post page and its generateMetadata both need the same rows
export const getPost = cache((id: number) => read.getPost(createAnonClient(), id))

export const getPostTags = cache((postId: number) => read.getPostTags(createAnonClient(), postId))

export async function getPostTagNames(postId: number): Promise<string[]> {
  const tags = await getPostTags(postId)
  return tags.map((t) => t.name)
}

/** Adjacent post ids for prev/next navigation on the detail page. */
export async function getPostNeighbours(id: number) {
  return read.getPostNeighbours(createAnonClient(), id)
}

/** Ids + dates of indexable posts, newest first — the sitemap's source. */
export async function getSitemapPosts(limit: number) {
  return read.getSitemapPosts(createAnonClient(), limit)
}

/**
 * Adds one view to a post — the only write the website makes, and the only reason it
 * still holds a service-role key at all.
 *
 * This was the `increment_post_view` SQL function until it was moved here. PostgREST
 * cannot send `view_count = view_count + 1`, so the increment is a read and then a
 * write, and the compare-and-swap is what stands in for the atomicity the SQL function
 * had for free: the update only lands while `view_count` is still what was read, and a
 * concurrent view that got there first makes it match no row, so we read again. Three
 * attempts, then the view is dropped — under real contention a lost view costs less
 * than a retry loop holding a request open.
 *
 * `tags.post_count` recounts rather than increments (packages/common/src/data/counters.ts);
 * this one cannot, because `view_count` is not derived from anything — the rows that
 * would define it are never stored.
 *
 * Service role because no table in the schema has a write policy any more. Nothing but
 * an id reaches this, and `view_count` is the only column written.
 */
export async function incrementPostView(postId: number): Promise<void> {
  const supabase = createAdminClient()

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: current } = await supabase
      .from('posts')
      .select('view_count')
      .eq('id', postId)
      .maybeSingle()
    if (!current) return

    const { data: bumped } = await supabase
      .from('posts')
      .update({ view_count: current.view_count + 1 })
      .eq('id', postId)
      .eq('view_count', current.view_count)
      .select('id')
      .maybeSingle()
    if (bumped) return
  }
}
