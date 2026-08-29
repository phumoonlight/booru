import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { searchTags as sharedSearchTags } from '@/lib/data/shared'
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

/** All tags, most used first — backs the /tags page. */
export async function getTags(limit = 200): Promise<Tag[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tags')
    .select('id, name, category, post_count')
    .order('post_count', { ascending: false })
    .order('name')
    .limit(limit)
  return data ?? []
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

// ensureTagIds and the tag-name search moved to lib/data/shared.ts — they are part of
// the post write path and the tag field, and that file takes its client so the desktop
// uploader (packages/post-app) can run them too.
