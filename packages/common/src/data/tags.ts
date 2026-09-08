import type { BooruClient } from '@common/supabase/types'
import { syncTagPostCounts } from '@common/data/counters'
import { markColor, parseTagInput, type Tag, type TagCategory } from '@common/tags'

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

/** How many glyphs a text mark may be — see `readTagMark` for why it is three. */
export const TAG_MARK_MAX = 3

/**
 * The typed-in mark as it is stored: a colour, a short run of glyphs, or nothing.
 *
 * An empty box means "no mark" and clears the column rather than failing, which is how a
 * mark is removed.
 *
 * **A colour is taken first and stored lowercased** — `markColor` is the same test the
 * renderer will apply, so what is accepted here is exactly what will paint. Lowercasing
 * matters because `#7FC8FF` off a picker and `#7fc8ff` typed by hand are one value, and
 * two spellings of one colour is two rows that look identical and compare unequal.
 *
 * Otherwise it is glyphs, counted as **graphemes** — the unit a person means by "an
 * emoji" and not the unit `length` counts, since 🧑‍🚀 is five UTF-16 units and 🇯🇵 is four,
 * so a character cap would have refused half the keyboard's own suggestions. Three at
 * most: a pair still reads as one mark in front of a name, and past that the glyphs start
 * competing with the name they are there to identify. Over the cap is refused rather than
 * truncated — the extra one was typed on purpose, and silently dropping it is how a field
 * teaches nobody what it wants.
 *
 * A plain ASCII character is refused, per glyph rather than for the value as a whole. The
 * column would hold it and the label would draw it, but `[` in front of a tag name is a
 * typo every time it happens. This is also what catches a near-miss colour: `#7fc8f` is
 * five hex digits, no CSS form, and every character in it is plain ASCII, so it is turned
 * away here rather than stored as a five-character "emoji" that draws as itself.
 */
export function readTagMark(raw: string): { mark: string | null } | { error: string } {
  const value = raw.trim()
  if (value === '') return { mark: null }

  const color = markColor(value)
  if (color) return { mark: color }

  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)]
  if (graphemes.length > TAG_MARK_MAX) {
    return { error: `${TAG_MARK_MAX} glyphs at most — that is ${graphemes.length}.` }
  }
  if (graphemes.some((entry) => /^[\x20-\x7e]$/.test(entry.segment))) {
    return { error: 'Type an emoji, a #hex colour, or a CSS colour name.' }
  }
  return { mark: value }
}

export async function getTagByName(client: BooruClient, name: string): Promise<Tag | null> {
  const { data } = await client
    .from('tags')
    .select('id, name, category, mark, post_count')
    .eq('name', name)
    .maybeSingle()
  return data
}

/** One tag by id — the tag page's own address, so a rename never breaks a link. */
export async function getTagById(client: BooruClient, id: number): Promise<Tag | null> {
  const { data } = await client
    .from('tags')
    .select('id, name, category, mark, post_count')
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
  sectionId: number | null = null
): Promise<TagOutcome<{ name: string }>> {
  const parsed = readTagName(rawName)
  if ('error' in parsed) return { ok: false, error: parsed.error }

  const { error } = await client
    .from('tags')
    .insert({ name: parsed.name, category, form_section_id: sectionId })
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
 *
 * **The form section goes with it.** A section belongs to a category — `(category, name)`
 * is unique on `tag_form_section` — so the row a tag was drawn on does not exist in the
 * category it is moving to. The desktop's edit panel sets both in one save, and this
 * clearing is what makes the order of those two writes not matter: a category change never
 * leaves a tag pointing at a row drawn under some other heading.
 */
export async function setTagCategory(
  client: BooruClient,
  id: number,
  category: TagCategory
): Promise<TagOutcome> {
  const { error } = await client
    .from('tags')
    .update({ category, form_section_id: null })
    .eq('id', id)
  if (error) return { ok: false, error: `Update failed: ${error.message}` }
  return { ok: true }
}

/**
 * Move a tag onto another row of the desktop tag form, or off every row with null —
 * `tags.form_section_id`.
 *
 * An id, not a name. The section it points at can be renamed afterwards and this tag
 * follows, which is the whole reason that table has ids; a name here would have been the
 * tag's own copy of a spelling, going stale the moment the row it names is corrected.
 *
 * Nothing is validated beyond what the foreign key does: an id that is not a section is
 * refused by the database rather than checked twice.
 */
export async function setTagFormSection(
  client: BooruClient,
  id: number,
  sectionId: number | null
): Promise<TagOutcome> {
  const { error } = await client.from('tags').update({ form_section_id: sectionId }).eq('id', id)
  if (error) return { ok: false, error: `Update failed: ${error.message}` }
  return { ok: true }
}

/**
 * Set what is drawn in front of a tag's name — a glyph or a colour — or clear it with an
 * empty string. `tags.mark`.
 *
 * The most cosmetic write there is: it moves no post, no link and no count, and a wrong
 * value costs one mark at the front of a label. Its own channel rather than a field on
 * the category or the rename — what a tag *is* and what it is drawn with are two separate
 * decisions about the row.
 */
export async function setTagMark(
  client: BooruClient,
  id: number,
  rawMark: string
): Promise<TagOutcome<{ mark: string | null }>> {
  const parsed = readTagMark(rawMark)
  if ('error' in parsed) return { ok: false, error: parsed.error }

  const { error } = await client.from('tags').update({ mark: parsed.mark }).eq('id', id)
  if (error) return { ok: false, error: `Update failed: ${error.message}` }
  return { ok: true, mark: parsed.mark }
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
  // `post_tags` first because that foreign key does not cascade, and the delete below
  // would be refused with it still pointing here. `tag_rules` needs no such step: both of
  // its keys cascade, so a deleted tag takes every rule naming it — which is the whole
  // reason those rules are rows and not names in a file.
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
 * Both tags have to exist. For the condition that was always true — a name nobody has
 * used matches no posts, and "applied to 0 posts" is a worse answer than "no such tag"
 * for what is nearly always a typo. The target used to be coined here if it was new,
 * which made these two boxes the last place in the app where typing a name created a
 * tag: a slip in the target box would have put a `general` tag nobody meant onto every
 * matching post at once. Naming a tag is the Tags screen's job, and the grid is right
 * underneath this panel.
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
      .select('id, name, category, mark, post_count')
      .in('name', [target.name, condition.name])
    if (error) throw new Error(`Could not read the tags: ${error.message}`)

    const conditionTag = (rows ?? []).find((tag) => tag.name === condition.name)
    if (!conditionTag) {
      return { ok: false, error: `${condition.name} is not a tag on this board.` }
    }

    const targetTag = (rows ?? []).find((tag) => tag.name === target.name)
    if (!targetTag) {
      return {
        ok: false,
        error: `${target.name} is not a tag on this board — create it first.`,
      }
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
