'use server'

import { browseTags } from '@/lib/data/tags'
import { TAGS_PER_PAGE } from '@/lib/tags-url'
import type { Tag } from '@common/tags'

/**
 * The tags table's next ten rows. An action rather than a route handler, for the reason
 * `loadMorePosts` is one: the data layer stays the only query surface, and the desktop
 * app can reuse what is in it.
 *
 * It costs no query in the ordinary case — `browseTags` slices the day-long cache — so
 * this is a round trip and nothing more. Everything arriving here comes from the browser,
 * so the offset is checked as an integer and the size is fixed rather than passed.
 */
export async function loadMoreTags({
  find,
  category,
  offset,
}: {
  find: string
  category: string
  offset: number
}): Promise<{ tags: Tag[]; hasMore: boolean }> {
  if (!Number.isInteger(offset) || offset < 0) return { tags: [], hasMore: false }

  const page = await browseTags({ find, category, offset, limit: TAGS_PER_PAGE })
  return { tags: page.tags, hasMore: page.hasMore }
}
