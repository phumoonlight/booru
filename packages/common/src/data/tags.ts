import { BOARD, type Board } from '@common/board'
import { first, isUniqueViolation, type Db } from '@common/db'
import { syncTagPostCounts } from '@common/data/counters'
import { markColor, parseTagInput, type Tag, type TagCategory } from '@common/tags'

/**
 * Tag management: create, apply-by-tag, rename, recategorize, delete.
 *
 * These were server actions on the website's /tags/manage. They moved here whole when
 * the board lost its login: the website reads and never writes, so managing the
 * vocabulary is the desktop app's job now, and the desktop has no server actions to put
 * them in.
 *
 * Every one answers `{ ok }` or `{ error }` rather than throwing. That was already the
 * shape the forms wanted — each failure here is something the typist can fix in the
 * field still on screen — and it is exactly what an IPC channel can carry, where a
 * thrown Error arrives as a string with a stack glued to the front of it. The driver
 * throws, so each write catches; `isUniqueViolation` is the one code anybody has to
 * distinguish.
 */

export type TagOutcome<T = unknown> = ({ ok: true } & T) | { ok: false; error: string }

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

export async function getTagByName(db: Db, name: string): Promise<Tag | null> {
  return first(
    await db<Tag[]>`select id, name, category, mark, post_count from tags where name = ${name}`
  )
}

/** One tag by id — the tag page's own address, so a rename never breaks a link. */
export async function getTagById(db: Db, id: number): Promise<Tag | null> {
  return first(
    await db<Tag[]>`select id, name, category, mark, post_count from tags where id = ${id}`
  )
}

/**
 * Add a tag nobody has used yet, which is the only way a tag comes into being: no write
 * path coins one, so this and the Tags screen behind it are where the vocabulary is
 * decided. It starts on no posts, so `post_count` keeps its default of 0 and no counter
 * needs syncing.
 */
export async function createTag(
  db: Db,
  rawName: string,
  category: TagCategory,
  sectionId: number | null = null
): Promise<TagOutcome<{ name: string }>> {
  const parsed = readTagName(rawName)
  if ('error' in parsed) return { ok: false, error: parsed.error }

  try {
    await db`
      insert into tags (name, category, form_section_id)
      values (${parsed.name}, ${category}, ${sectionId})`
    return { ok: true, name: parsed.name }
  } catch (error) {
    // `tags.name` is the only unique column on the table, so this always means one thing.
    if (isUniqueViolation(error)) return { ok: false, error: `${parsed.name} already exists.` }
    return { ok: false, error: `Could not create the tag: ${message(error)}` }
  }
}

/**
 * Rename a tag in place. The row keeps its id, so every `post_tags` link, every rule that
 * names it and every `/tags/[id]` link survives untouched — only the text moves, and with
 * it the searches that spell the old name. Nothing is recounted: the same posts carry the
 * same tag.
 *
 * A name already taken is refused rather than merged. Folding two tags into one means
 * moving links and recounting both, and doing that silently behind a rename would be a
 * destructive edit wearing a cosmetic one's clothes.
 */
export async function renameTag(
  db: Db,
  id: number,
  rawName: string
): Promise<TagOutcome<{ name: string }>> {
  const parsed = readTagName(rawName)
  if ('error' in parsed) return { ok: false, error: parsed.error }

  try {
    await db`update tags set name = ${parsed.name} where id = ${id}`
    return { ok: true, name: parsed.name }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: `${parsed.name} is already a tag — rename it to something else.` }
    }
    return { ok: false, error: `Rename failed: ${message(error)}` }
  }
}

/**
 * Recategorize one tag. Category is cosmetic — it only drives the colour and the
 * grouping — so the tag's name, id and post links are untouched and nothing has to be
 * recounted.
 *
 * **The form section stays.** A section is not a division of a category any more — it is a
 * row of the form, and `clothes` is the right row for a dress whichever category the dress
 * is filed under. This used to clear the column, because the row a tag sat on genuinely did
 * not exist in the category it was moving to; there is nothing for it to be outside of now,
 * so the two writes the edit panel makes are independent and their order does not matter.
 */
export async function setTagCategory(
  db: Db,
  id: number,
  category: TagCategory
): Promise<TagOutcome> {
  try {
    await db`update tags set category = ${category} where id = ${id}`
    return { ok: true }
  } catch (error) {
    return { ok: false, error: `Update failed: ${message(error)}` }
  }
}

/**
 * Move a tag onto another row of the desktop tag form, or off every row with null —
 * `tags.form_section_id`.
 *
 * An id, not a name. The section it points at can be renamed afterwards and this tag
 * follows, which is the whole reason that table has ids; a name here would have been the
 * tag's own copy of a spelling, going stale the moment the row it names is corrected.
 *
 * An id that is not a section is refused by the foreign key rather than checked twice. The
 * one thing checked here is the other way round: a row **cannot wait for a tag that is on
 * it**, so a tag cannot be filed onto a row whose condition names it. That is the same
 * refusal `editFormSections` makes about the same pair, from the other end — the condition
 * decides whether the row is drawn, and the row is the only place its tags are offered from,
 * so the two together are a row that can never be opened to answer its own condition.
 */
export async function setTagFormSection(
  db: Db,
  id: number,
  sectionId: number | null
): Promise<TagOutcome> {
  try {
    if (sectionId !== null) {
      const waits = await db<{ name: string }[]>`
        select s.name from tag_form_section_deps d
          join tag_form_sections s on s.id = d.section_id
         where d.section_id = ${sectionId} and d.tag_id = ${id}`
      if (waits.length > 0) {
        return {
          ok: false,
          error: `${waits[0].name} waits for this tag, so it cannot also be offered from that row — the row would never be drawn.`,
        }
      }
    }

    await db`update tags set form_section_id = ${sectionId} where id = ${id}`
    return { ok: true }
  } catch (error) {
    return { ok: false, error: `Update failed: ${message(error)}` }
  }
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
  db: Db,
  id: number,
  rawMark: string
): Promise<TagOutcome<{ mark: string | null }>> {
  const parsed = readTagMark(rawMark)
  if ('error' in parsed) return { ok: false, error: parsed.error }

  try {
    await db`update tags set mark = ${parsed.mark} where id = ${id}`
    return { ok: true, mark: parsed.mark }
  } catch (error) {
    return { ok: false, error: `Update failed: ${message(error)}` }
  }
}

/**
 * Remove a tag from the board entirely — it comes off every post that carries it.
 *
 * **Every board's links, not the gallery's.** The vocabulary is shared and neither link
 * table cascades from `tags`, so a single row in `generative_post_tags` is enough for the
 * foreign key to refuse the whole delete. Both go first, in the same statement, so a
 * half-done delete is not a state this can leave behind. `tag_rules` and
 * `tag_form_section_deps` need no such step — both of their keys cascade, so a deleted tag
 * takes every rule and every dependency naming it, which is the whole reason those are
 * rows and not names in a file.
 *
 * The two boards are **written out** rather than folded over `BOARDS`: a fold says it in
 * nested query fragments, which is the one construction in this file that cannot be read
 * as SQL on the page, and a delete is the wrong statement to be clever in. A third board
 * adds a line here — which is the shape of adding a third board generally (see
 * `@common/board`), not a debt this function is carrying alone.
 *
 * No counter to recount: the only counts these links fed belong to the tag being deleted.
 * Other tags on those posts keep every link they had.
 */
export async function deleteTag(db: Db, id: number): Promise<TagOutcome> {
  try {
    await db`
      with links_post as (
             delete from ${db(BOARD.post.postTags)} where tag_id = ${id}),
           links_generative as (
             delete from ${db(BOARD.generative.postTags)} where tag_id = ${id})
      delete from tags where id = ${id}`
    return { ok: true }
  } catch (error) {
    return { ok: false, error: `Delete failed: ${message(error)}` }
  }
}

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
 * **The apply is one statement.** It read every matching post id and every post that
 * already carried the target, in thousand-row pages, subtracted the two lists in
 * TypeScript and inserted the remainder five hundred rows at a time — all of it working
 * around a request that answers with one page. `insert … select … on conflict do nothing`
 * is the same thing said once, and `returning` is what makes the counts exact: the point
 * of this panel is the difference between "added to 3 posts, 41 already had it" and a
 * rule that was already satisfied, which an upsert that ignored duplicates could not tell
 * you.
 */
export async function applyTagToTagged(
  db: Db,
  rawTarget: string,
  rawCondition: string,
  board: Board = 'post'
): Promise<TagOutcome<ApplyTagResult>> {
  const target = readTagName(rawTarget)
  if ('error' in target) return { ok: false, error: target.error }
  const condition = readTagName(rawCondition)
  if ('error' in condition) return { ok: false, error: condition.error }
  if (target.name === condition.name) {
    return { ok: false, error: 'Those are the same tag — every matching post already has it.' }
  }

  try {
    const rows = await db<{ id: number; name: string }[]>`
      select id, name from tags where name = any(${[target.name, condition.name]})`
    const found = new Map(rows.map((row) => [row.name, row.id]))

    const conditionId = found.get(condition.name)
    if (conditionId === undefined) {
      return { ok: false, error: `${condition.name} is not a tag on this board.` }
    }
    const targetId = found.get(target.name)
    if (targetId === undefined) {
      return { ok: false, error: `${target.name} is not a tag on this board — create it first.` }
    }

    // One board at a time: the two are separate sets of posts, so "add `swimsuit` to
    // everything tagged `bikini`" has a different answer on each, and one number reported
    // for both would be a count of nothing in particular.
    const postTags = BOARD[board].postTags

    // `matched` counts in the same snapshot as the insert, and is unaffected by it: the
    // rows going in carry the *target's* id, and this counts the condition's.
    const [counts] = await db<{ added: number; matched: number }[]>`
      with added as (
        insert into ${db(postTags)} (post_id, tag_id)
        select pt.post_id, ${targetId} from ${db(postTags)} pt where pt.tag_id = ${conditionId}
            on conflict do nothing
        returning post_id
      )
      select (select count(*)::int from added) as added,
             (select count(*)::int from ${db(postTags)} where tag_id = ${conditionId}) as matched`

    // Only the target moved: the condition tag is on exactly the posts it was on before.
    await syncTagPostCounts(db, [targetId], board)

    return {
      ok: true,
      target: target.name,
      condition: condition.name,
      added: counts.added,
      already: counts.matched - counts.added,
    }
  } catch (error) {
    return { ok: false, error: `Could not apply the tag: ${message(error)}` }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
