import type { BooruClient } from '@common/supabase/types'
import { syncTagPostCounts } from '@common/data/counters'
import { ensureTagIds } from '@common/data/shared'
import {
  normalizeSubcategory,
  parseTagInput,
  type Subcategory,
  type Tag,
  type TagCategory,
} from '@common/tags'

/**
 * Tag management: create, apply-by-tag, rename, recategorize, delete.
 *
 * These were server actions on the website's /tags/manage. They moved here whole when
 * the board lost its login: the website has an anon key and no write policy to use it
 * against, so managing the vocabulary is the desktop app's job now, and the desktop has
 * no server actions to put them in.
 *
 * Every one answers `{ ok }` or `{ error }` rather than throwing. That was already the
 * shape the forms wanted — each failure here is something the typist can fix in the
 * field still on screen — and it is exactly what an IPC channel can carry, where a
 * thrown Error arrives as a string with a stack glued to the front of it.
 */

export type TagOutcome<T = unknown> = ({ ok: true } & T) | { ok: false; error: string }

// Postgres' unique_violation. `tags.name` is the only unique column on the table, so
// this always means "that name is already a tag" — the one failure both create and
// rename have to explain rather than hand back as a database message.
const UNIQUE_VIOLATION = '23505'

/**
 * The typed-in name, normalized the way an upload's tag box normalizes it — same
 * lowercasing, same character rule — so a tag created here and a tag created by an
 * upload can never differ in form. A space is what starts a second name, which is why
 * two tokens is an error and not a silent "we took the first one".
 */
export function readTagName(raw: string): { name: string } | { error: string } {
  if (raw.length > 64) return { error: 'That name is too long — 64 characters at most.' }

  const { tags, invalid } = parseTagInput(raw)
  if (invalid.length > 0) {
    return { error: `“${invalid[0]}” can only use lowercase letters, digits and _ ( ) . -` }
  }
  if (tags.length === 0) return { error: 'Type a tag name.' }
  if (tags.length > 1) return { error: 'One tag at a time — the space starts a second name.' }
  return { name: tags[0] }
}

export async function getTagByName(client: BooruClient, name: string): Promise<Tag | null> {
  const { data } = await client
    .from('tags')
    .select('id, name, category, post_count')
    .eq('name', name)
    .maybeSingle()
  return data
}

/** One tag by id — the tag page's own address, so a rename never breaks a link. */
export async function getTagById(client: BooruClient, id: number): Promise<Tag | null> {
  const { data } = await client
    .from('tags')
    .select('id, name, category, post_count')
    .eq('id', id)
    .maybeSingle()
  return data
}

/**
 * Add a tag nobody has used yet. Uploads create tags as a side effect of applying them,
 * so this exists for the other order: naming an artist or a series first and tagging
 * posts with it afterwards, with the category already right. It starts on no posts, so
 * `post_count` keeps its default of 0 and no counter needs syncing.
 */
export async function createTag(
  client: BooruClient,
  rawName: string,
  category: TagCategory,
  rawSubcategory = ''
): Promise<TagOutcome<{ name: string }>> {
  const parsed = readTagName(rawName)
  if ('error' in parsed) return { ok: false, error: parsed.error }

  const { error } = await client
    .from('tags')
    .insert({ name: parsed.name, category, category2: normalizeSubcategory(rawSubcategory) })
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: false, error: `${parsed.name} already exists.` }
    return { ok: false, error: `Could not create the tag: ${error.message}` }
  }
  return { ok: true, name: parsed.name }
}

/**
 * Rename a tag in place. The row keeps its id, so every `post_tags` link and every
 * `/tags/[id]` link survives untouched — only the text moves, and with it the searches
 * that spell the old name. Nothing is recounted: the same posts carry the same tag.
 *
 * A name already taken is refused rather than merged. Folding two tags into one means
 * moving links and recounting both, and doing that silently behind a rename would be a
 * destructive edit wearing a cosmetic one's clothes.
 */
export async function renameTag(
  client: BooruClient,
  id: number,
  rawName: string
): Promise<TagOutcome<{ name: string }>> {
  const parsed = readTagName(rawName)
  if ('error' in parsed) return { ok: false, error: parsed.error }

  const { error } = await client.from('tags').update({ name: parsed.name }).eq('id', id)
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, error: `${parsed.name} is already a tag — rename it to something else.` }
    }
    return { ok: false, error: `Rename failed: ${error.message}` }
  }
  return { ok: true, name: parsed.name }
}

/**
 * Recategorize one tag. Category is cosmetic — it only drives the colour and the
 * grouping — so the tag's name, id and post links are untouched and nothing has to be
 * recounted.
 */
export async function setTagCategory(
  client: BooruClient,
  id: number,
  category: TagCategory
): Promise<TagOutcome> {
  const { error } = await client.from('tags').update({ category }).eq('id', id)
  if (error) return { ok: false, error: `Update failed: ${error.message}` }
  return { ok: true }
}

/**
 * Move a tag into a subgroup of its category, or out of one — `tags.category2`.
 *
 * Cosmetic in exactly the way the category is, and a little less than that: nothing but
 * the desktop app's tag picker reads this column, so a wrong value costs a block heading
 * and never a post, a link or a search. It is normalized rather than validated for the
 * same reason — there is no list of subgroups to be outside of, only a spelling to keep
 * to, which is what `normalizeSubcategory` is.
 */
export async function setTagSubcategory(
  client: BooruClient,
  id: number,
  rawSubcategory: string
): Promise<TagOutcome<{ category2: Subcategory }>> {
  if (rawSubcategory.length > 64) {
    return { ok: false, error: 'That subgroup name is too long — 64 characters at most.' }
  }

  const category2 = normalizeSubcategory(rawSubcategory)
  const { error } = await client.from('tags').update({ category2 }).eq('id', id)
  if (error) return { ok: false, error: `Update failed: ${error.message}` }
  return { ok: true, category2 }
}

/**
 * Remove a tag from the board entirely — it comes off every post that carries it.
 * post_tags has no cascade from tags, so its rows go first or the foreign key
 * refuses the delete.
 *
 * No counter to recount: the only `post_count` these links fed belongs to the tag being
 * deleted. Other tags on those posts keep every link they had.
 */
export async function deleteTag(client: BooruClient, id: number): Promise<TagOutcome> {
  const { error: linkError } = await client.from('post_tags').delete().eq('tag_id', id)
  if (linkError) return { ok: false, error: `Delete failed: ${linkError.message}` }

  const { error } = await client.from('tags').delete().eq('id', id)
  if (error) return { ok: false, error: `Delete failed: ${error.message}` }
  return { ok: true }
}

/**
 * PostgREST answers at most a thousand rows per request whatever the query says, so a
 * tag on more posts than that has to be read a page at a time — an unpaged read would
 * silently tag the first thousand posts and report itself finished.
 */
const PAGE = 1000

async function postIdsWithTag(client: BooruClient, tagId: number): Promise<number[]> {
  const ids: number[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
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
  target: string
  condition: string
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
 * applies — naming it first only buys it a category.
 *
 * Posts that already carry the target are filtered out rather than inserted and left to
 * the unique constraint: the point is the count that comes back. "Added to 3 posts, 41
 * already had it" is the difference between a rule that did something and one that was
 * already satisfied, and an upsert that ignored duplicates could not tell them apart.
 */
export async function applyTagToTagged(
  client: BooruClient,
  rawTarget: string,
  rawCondition: string
): Promise<TagOutcome<ApplyTagResult>> {
  const target = readTagName(rawTarget)
  if ('error' in target) return { ok: false, error: target.error }
  const condition = readTagName(rawCondition)
  if ('error' in condition) return { ok: false, error: condition.error }
  if (target.name === condition.name) {
    return { ok: false, error: 'Those are the same tag — every matching post already has it.' }
  }

  try {
    const { data: rows, error } = await client
      .from('tags')
      .select('id, name, category, post_count')
      .in('name', [target.name, condition.name])
    if (error) throw new Error(`Could not read the tags: ${error.message}`)

    const conditionTag = (rows ?? []).find((tag) => tag.name === condition.name)
    if (!conditionTag) {
      return { ok: false, error: `${condition.name} is not a tag on this board.` }
    }

    let targetTag = (rows ?? []).find((tag) => tag.name === target.name)
    if (!targetTag) {
      const [id] = await ensureTagIds(client, [target.name])
      targetTag = { id, name: target.name, category: 'general', post_count: 0 }
    }
    const targetId = targetTag.id

    const [matched, carried] = await Promise.all([
      postIdsWithTag(client, conditionTag.id),
      postIdsWithTag(client, targetId),
    ])
    const have = new Set(carried)
    const missing = matched.filter((id) => !have.has(id))

    for (let at = 0; at < missing.length; at += INSERT_CHUNK) {
      const { error: insertError } = await client
        .from('post_tags')
        .insert(missing.slice(at, at + INSERT_CHUNK).map((post_id) => ({ post_id, tag_id: targetId })))
      // Whatever landed before this stays applied — the counter below is recomputed from
      // the links that exist, so a half-finished run leaves the board consistent and the
      // same apply run again picks up exactly what is left.
      if (insertError) throw new Error(`Could not apply the tag: ${insertError.message}`)
    }

    // Only the target moved: the condition tag is on exactly the posts it was on before.
    await syncTagPostCounts(client, [targetId])

    return {
      ok: true,
      target: target.name,
      condition: condition.name,
      added: missing.length,
      already: matched.length - missing.length,
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not apply the tag.' }
  }
}
