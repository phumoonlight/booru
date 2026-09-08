import 'server-only'
import { db } from '@/lib/db'
import { listTags, searchTags as sharedSearchTags } from '@common/data/shared'
import * as tags from '@common/data/tags'
import { categoryOrder, type Tag, type TagCategory } from '@common/tags'

/**
 * Tag reads, and only reads. Creating, renaming, recategorizing and deleting tags moved
 * to the desktop app with the rest of the management — `booru_web` has no write grant
 * on `tags` at all, so this half of the app could not manage the vocabulary if it tried.
 */

export async function getTagByName(name: string): Promise<Tag | null> {
  return tags.getTagByName(db(), name)
}

/** One tag by id — the tag page's own address, so a rename never breaks a link. */
export async function getTagById(id: number): Promise<Tag | null> {
  return tags.getTagById(db(), id)
}

/**
 * All tags, most used first — backs the /tags page. Query in shared.ts; the desktop app's
 * Tags screen runs the same one.
 *
 * `listTags` throws on a refused read, which is what the desktop wants: there it is the
 * vocabulary, and an empty list said in its place was a bug that hid for a day. A page is
 * the other case — a visitor gets more from an index that came up short than from a 500 —
 * so the throw is caught here and left in the server log, where the truth belongs.
 */
export async function getTags(limit = 200): Promise<Tag[]> {
  try {
    return await listTags(db(), limit)
  } catch (error) {
    console.error('Could not read the tags:', error instanceof Error ? error.message : error)
    return []
  }
}

/** Groups tags into display order: the known categories, then any others A–Z. */
export function groupByCategory(tags: Tag[]): [TagCategory, Tag[]][] {
  return categoryOrder(tags.map((t) => t.category))
    .map((category) => [category, tags.filter((t) => t.category === category)] as [TagCategory, Tag[]])
    .filter(([, group]) => group.length > 0)
}

/** Tag autocomplete — the query is in `@common/data/shared`, which the desktop app
 * also runs. */
export async function searchTags(query: string, limit = 8): Promise<Tag[]> {
  return sharedSearchTags(db(), query, limit)
}
