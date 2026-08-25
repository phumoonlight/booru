'use server'

import { searchTags } from '@/lib/data/search'
import type { Tag } from '@/lib/data/tags'

/**
 * Autocomplete source for the client search bar. Deliberately a server action
 * rather than a route handler — the public API is deferred (docs/future.md), and
 * lib/data/search.ts stays reusable when it arrives.
 */
export async function suggestTags(prefix: string): Promise<Tag[]> {
  return searchTags(prefix, 8)
}
