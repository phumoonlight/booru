import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { listTags, searchTags as sharedSearchTags } from '@/lib/data/shared'
import { TAG_CATEGORIES, type Tag, type TagCategory } from '@/lib/tags'

export async function getTagByName(name: string): Promise<Tag | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tags')
    .select('id, name, category, post_count')
    .eq('name', name)
    .maybeSingle()
  return data
}

/** One tag by id — the tag page's own address, so a rename never breaks a link. */
export async function getTagById(id: number): Promise<Tag | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tags')
    .select('id, name, category, post_count')
    .eq('id', id)
    .maybeSingle()
  return data
}

/** All tags, most used first — backs the /tags page. Query in shared.ts; the desktop
 *  uploader's Tags screen runs the same one. */
export async function getTags(limit = 200): Promise<Tag[]> {
  return listTags(await createClient(), limit)
}

/** Groups tags into display order: artist → copyright → character → general → meta. */
export function groupByCategory(tags: Tag[]): [TagCategory, Tag[]][] {
  return TAG_CATEGORIES.map(
    (category) => [category, tags.filter((t) => t.category === category)] as [TagCategory, Tag[]]
  ).filter(([, group]) => group.length > 0)
}

/** Tag autocomplete — the query is in lib/data/shared.ts, which the desktop uploader also runs. */
export async function searchTags(query: string, limit = 8): Promise<Tag[]> {
  return sharedSearchTags(await createClient(), query, limit)
}

// ensureTagIds, the tag-name search and the tag index moved to lib/data/shared.ts — they are part of
// the post write path and the tag field, and that file takes its client so the desktop
// uploader (packages/desktop) can run them too.
