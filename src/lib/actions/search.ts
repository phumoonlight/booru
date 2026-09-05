'use server'

import { searchPosts, POSTS_PER_PAGE } from '@/lib/data/search'
import { searchTags } from '@/lib/data/tags'
import type { Post } from '@/lib/data/posts'
import type { Tag } from '@common/tags'

/**
 * Autocomplete source for the client search bar. Deliberately a server action rather
 * than a route handler, so the query stays in the data layer where a second caller can
 * reuse it — which is what the desktop app does with the same function.
 */
export async function suggestTags(prefix: string): Promise<Tag[]> {
  return searchTags(prefix, 8)
}

/**
 * The feed's next chunk. A read, so there is no `requireUser()` here: it can return
 * nothing a visitor could not have reached by typing `?from=` — the anon key and RLS
 * are the same ones the page itself renders through.
 *
 * `after` is a cursor, not an offset, so it is checked as an integer and nothing more;
 * PostgREST parameterizes it, and a nonsense id can only produce an empty chunk.
 */
export async function loadMorePosts({
  query,
  after,
  perPage,
}: {
  query: string
  after: number
  /** A listing may run at its own size — the tag page shows ten at a time. Clamped
      here, because it arrives from the browser like everything else. */
  perPage?: number
}): Promise<{ posts: Post[]; hasMore: boolean }> {
  if (!Number.isInteger(after) || after <= 0) return { posts: [], hasMore: false }

  const size =
    perPage !== undefined && Number.isInteger(perPage)
      ? Math.min(Math.max(perPage, 1), POSTS_PER_PAGE)
      : POSTS_PER_PAGE

  return searchPosts({ query, after, perPage: size })
}
