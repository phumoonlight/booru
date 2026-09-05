import 'server-only'
import { createAnonClient } from '@/lib/supabase/anon'
import { listTags, searchTags as sharedSearchTags } from '@common/data/shared'
import * as tags from '@common/data/tags'
import { categoryOrder, type Tag, type TagCategory } from '@common/tags'

/**
 * Tag reads, and only reads. Creating, renaming, recategorizing and deleting tags moved
 * to the desktop app with the rest of the management — the website holds an anon key
 * and the schema has no write policy for it to use.
 */

export async function getTagByName(name: string): Promise<Tag | null> {
  return tags.getTagByName(createAnonClient(), name)
}

/** One tag by id — the tag page's own address, so a rename never breaks a link. */
export async function getTagById(id: number): Promise<Tag | null> {
  return tags.getTagById(createAnonClient(), id)
}

/** All tags, most used first — backs the /tags page. Query in shared.ts; the desktop
 *  app's Tags screen runs the same one. */
export async function getTags(limit = 200): Promise<Tag[]> {
  return listTags(createAnonClient(), limit)
}

/** Groups tags into display order: the five known categories, then any others A–Z. */
export function groupByCategory(tags: Tag[]): [TagCategory, Tag[]][] {
  return categoryOrder(tags.map((t) => t.category)).map(
    (category) => [category, tags.filter((t) => t.category === category)] as [TagCategory, Tag[]]
  ).filter(([, group]) => group.length > 0)
}

/** Tag autocomplete — the query is in `@common/data/shared`, which the desktop app
 * also runs. */
export async function searchTags(query: string, limit = 8): Promise<Tag[]> {
  return sharedSearchTags(createAnonClient(), query, limit)
}
