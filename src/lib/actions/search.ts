'use server'

import { searchPostsAfter, searchTags, POSTS_PER_PAGE } from '@/lib/data/search'
import type { Post } from '@/lib/data/posts'
import type { Tag } from '@/lib/tags'

/**
 * Autocomplete source for the client search bar. Deliberately a server action
 * rather than a route handler — the public API is deferred (docs/future.md), and
 * lib/data/search.ts stays reusable when it arrives.
 */
export async function suggestTags(prefix: string): Promise<Tag[]> {
  return searchTags(prefix, 8)
}

/**
 * The feed's next chunk. A read, so there is no `requireUser()` here: it can return
 * nothing a visitor could not have reached by typing `?page=` — the anon key and RLS
 * are the same ones the page itself renders through.
 *
 * `beforeId` is a cursor, not an offset, so it is checked as an integer and nothing
 * more; PostgREST parameterizes it, and a nonsense id can only produce an empty chunk.
 */
export async function loadMorePosts({
  query,
  beforeId,
}: {
  query: string
  beforeId: number
}): Promise<{ posts: Post[]; hasMore: boolean }> {
  if (!Number.isInteger(beforeId) || beforeId <= 0) return { posts: [], hasMore: false }

  return searchPostsAfter({ query, beforeId, perPage: POSTS_PER_PAGE })
}
