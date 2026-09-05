import { createAnonClient } from '@/lib/supabase/anon'
import * as read from '@common/data/search'

/**
 * The website's half of the search: `@common/data/search` bound to the anon client.
 * The grammar, the tag resolution and the cursor all live in there, because the desktop
 * app's browse screen runs the same query and a second implementation is how `-tag`
 * ends up meaning two things.
 */

export { POSTS_PER_PAGE, FEED_CHUNK_SIZE } from '@common/data/search'

export async function searchPosts(options: Parameters<typeof read.searchPosts>[1] = {}) {
  return read.searchPosts(createAnonClient(), options)
}

export async function getTagsForPosts(postIds: number[]) {
  return read.getTagsForPosts(createAnonClient(), postIds)
}
