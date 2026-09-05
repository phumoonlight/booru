import { createAnonClient } from '@/lib/supabase/anon'
import * as read from '@common/data/search'
import { visibleRatings } from '@/lib/nsfw-server'

/**
 * The website's half of the search: `@common/data/search` bound to the anon client.
 * The grammar, the tag resolution and the cursor all live in there, because the desktop
 * app's browse screen runs the same query and a second implementation is how `-tag`
 * ends up meaning two things.
 */

export { POSTS_PER_PAGE, FEED_CHUNK_SIZE } from '@common/data/search'

/**
 * Every listing the website renders, including the feed's later chunks and the tag
 * page's sample. The adult tiers are added here, from the request's cookie, rather than
 * by each caller: a page that forgot would show them, and the first chunk agreeing with
 * the next is not something to have to remember at four call sites.
 */
export async function searchPosts(options: Parameters<typeof read.searchPosts>[1] = {}) {
  return read.searchPosts(createAnonClient(), {
    ...options,
    visibleRatings: await visibleRatings(),
  })
}

export async function getTagsForPosts(postIds: number[]) {
  return read.getTagsForPosts(createAnonClient(), postIds)
}
