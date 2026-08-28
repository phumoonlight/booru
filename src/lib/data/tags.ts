import 'server-only'
import { createClient, type ServerClient } from '@/lib/supabase/server'
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

/**
 * Tags whose name contains `query`, most used first — backs the tag field's autocomplete.
 * A substring match, not a prefix one, so typing `hair` still surfaces `black_hair`.
 * `_` is a LIKE wildcard and nearly every multi-word tag carries one, so it's escaped:
 * otherwise `black_hair` would also match `blackXhair`.
 */
export async function searchTags(query: string, limit = 8): Promise<Tag[]> {
  const needle = query.trim().toLowerCase().replace(/[\\%_]/g, '\\$&')
  if (!needle) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('tags')
    .select('id, name, category, post_count')
    .ilike('name', `%${needle}%`)
    .order('post_count', { ascending: false })
    .order('name')
    .limit(limit)
  return data ?? []
}

/**
 * Ids for `names`, creating any tag that isn't on the board yet. `ignoreDuplicates`
 * makes the write an `on conflict do nothing`, so an existing tag keeps its category
 * and its post_count — only genuinely new names get a row.
 */
export async function ensureTagIds(supabase: ServerClient, names: string[]): Promise<number[]> {
  if (names.length === 0) return []

  const { error } = await supabase
    .from('tags')
    .upsert(
      names.map((name) => ({ name })),
      { onConflict: 'name', ignoreDuplicates: true }
    )
  if (error) throw new Error(`Could not create tags: ${error.message}`)

  const { data, error: readError } = await supabase.from('tags').select('id').in('name', names)
  if (readError) throw new Error(`Could not read tags: ${readError.message}`)
  return (data ?? []).map((row) => row.id)
}
