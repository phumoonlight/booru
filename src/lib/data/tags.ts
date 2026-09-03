import 'server-only'
import { createClient, type ServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureTagIds, listTags, searchTags as sharedSearchTags } from '@/lib/data/shared'
import { syncTagPostCounts } from '@/lib/data/counters'
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

/**
 * PostgREST answers at most a thousand rows per request whatever the query says, so a
 * tag on more posts than that has to be read a page at a time — an unpaged read would
 * silently tag the first thousand posts and report itself finished.
 */
const PAGE = 1000

async function postIdsWithTag(supabase: ServerClient, tagId: number): Promise<number[]> {
  const ids: number[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('post_tags')
      .select('post_id')
      .eq('tag_id', tagId)
      .order('post_id')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`Could not read that tag's posts: ${error.message}`)
    ids.push(...(data ?? []).map((row) => row.post_id as number))
    if ((data ?? []).length < PAGE) return ids
  }
}

/** Enough rows per insert to keep a large apply to a handful of round trips, and few
 *  enough that one rejected statement doesn't take the whole run with it. */
const INSERT_CHUNK = 500

export type ApplyTagResult = {
  target: Tag
  condition: Tag
  /** Posts that gained the tag. */
  added: number
  /** Posts that matched the condition and already carried it. */
  already: number
}

/**
 * Adds `targetName` to every post already tagged `conditionName` — the bulk edit that
 * would otherwise be opening each post in turn. An implication, in practice: `swimsuit`
 * for everything tagged `bikini`.
 *
 * The condition tag has to exist, because a name nobody has used matches no posts and
 * "applied to 0 posts" is a worse answer than "no such tag" for what is nearly always a
 * typo. The target is created if it is new, the way an upload creates the tags it
 * applies — naming it first on /tags/manage only buys it a category.
 *
 * Posts that already carry the target are filtered out rather than inserted and left to
 * the unique constraint: the point is the count that comes back. "Added to 3 posts, 41
 * already had it" is the difference between a rule that did something and one that was
 * already satisfied, and an upsert that ignored duplicates could not tell them apart.
 */
export async function addTagToTaggedPosts(
  targetName: string,
  conditionName: string
): Promise<ApplyTagResult> {
  const supabase = await createClient()

  const { data: rows, error } = await supabase
    .from('tags')
    .select('id, name, category, post_count')
    .in('name', [targetName, conditionName])
  if (error) throw new Error(`Could not read the tags: ${error.message}`)

  const condition = (rows ?? []).find((tag) => tag.name === conditionName)
  if (!condition) throw new Error(`${conditionName} is not a tag on this board.`)

  let target = (rows ?? []).find((tag) => tag.name === targetName)
  if (!target) {
    const [id] = await ensureTagIds(supabase, [targetName])
    target = { id, name: targetName, category: 'general', post_count: 0 }
  }

  const [matched, carried] = await Promise.all([
    postIdsWithTag(supabase, condition.id),
    postIdsWithTag(supabase, target.id),
  ])
  const have = new Set(carried)
  const missing = matched.filter((id) => !have.has(id))

  for (let at = 0; at < missing.length; at += INSERT_CHUNK) {
    const { error: insertError } = await supabase
      .from('post_tags')
      .insert(
        missing.slice(at, at + INSERT_CHUNK).map((post_id) => ({ post_id, tag_id: target.id }))
      )
    // Whatever landed before this stays applied — the counter below is recomputed from
    // the links that exist, so a half-finished run leaves the board consistent and the
    // same apply run again picks up exactly what is left.
    if (insertError) throw new Error(`Could not apply the tag: ${insertError.message}`)
  }

  // Only the target moved: the condition tag is on exactly the posts it was on before.
  await syncTagPostCounts(createAdminClient(), [target.id])

  return { target, condition, added: missing.length, already: matched.length - missing.length }
}

// ensureTagIds, the tag-name search and the tag index moved to lib/data/shared.ts — they are part of
// the post write path and the tag field, and that file takes its client so the desktop
// uploader (packages/desktop) can run them too.
