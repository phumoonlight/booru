import 'server-only'
import { createClient } from '@/lib/supabase/server'
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
