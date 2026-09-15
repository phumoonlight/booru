import type { Db } from '@common/db'
import type { Tag } from '@common/tags'

// The tag reads every tag screen and write runs. Everything here takes its handle rather
// than building one (invariant 3).
//
// This file was the post write path until the boards were dropped (0012) — create, retag,
// delete and the counter behind them. What is left is the vocabulary: `tags` outlived the
// posts it was written for, and these two are how anything reaches it.

/**
 * Ids for `names`, every one of which must already be a tag on the board. A name that
 * isn't ends the write, naming the ones it couldn't find.
 *
 * It used to coin the missing ones with an `on conflict do nothing` upsert, which cost
 * two things. The visible one: a typo in a tag field became a tag, in an app where
 * naming one is otherwise the Tags screen's job — that screen has the whole vocabulary
 * on it, so a near-duplicate is seen before it is made. The quiet one: Postgres draws
 * the identity default *before* it tests the conflict, so every tag a post already had
 * burned a `tags.id` and threw the row away. A twenty-tag post spent twenty ids on each
 * save, and the post editor writes on every control use.
 *
 * The order of `names` is preserved, which one caller depends on: `setTagRule` asks for
 * the trigger and its targets in one lookup and takes the trigger back off the front.
 */
export async function resolveTagIds(db: Db, names: string[]): Promise<number[]> {
  if (names.length === 0) return []

  const rows = await db<{ id: number; name: string }[]>`
    select id, name from tags where name = any(${names})`

  const found = new Map(rows.map((row) => [row.name, row.id]))
  const missing = names.filter((name) => !found.has(name))
  if (missing.length > 0) {
    throw new Error(
      `Not a tag on this board: ${missing.join(', ')} — create it on the Tags screen first.`
    )
  }
  return names.map((name) => found.get(name) as number)
}

/**
 * Every tag, A–Z — the index behind the desktop app's Tags screen. The cap is the read's,
 * not the page's.
 *
 * The section comes back as the **id** alone. Its name travelled beside it for as long as
 * anything above this file worked in section names — a left join, and PostgREST's one
 * genuinely awkward embed before that, two paths leading from `tags` to
 * `tag_form_sections` making it ambiguous enough to need a constraint named. Nothing reads
 * the name off a tag any more: the form and the sections screen both hold the whole list of
 * rows in a store and match on the id, which is what the id was for.
 */
export async function listTags(db: Db, limit = 200): Promise<Tag[]> {
  // Thrown rather than answered with an empty list — the caller does not catch this, and
  // that is deliberate. A read that fails and a board with no tags are not the same
  // thing, and the screens cannot tell them apart: "no tags yet" is what a broken query
  // looked like for as long as it took to notice. Every other read in this file is a page
  // that degrades; this one is the vocabulary.
  return await db<Tag[]>`
    select id, name, category, mark, form_section_id
      from tags
     order by name
     limit ${limit}`
}
