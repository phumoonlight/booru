import { normalizeFormSection } from '@common/tags'
import { resolveTagIds } from '@common/data/shared'
import { isUniqueViolation, type Db } from '@common/db'

/**
 * The rows the desktop tag form draws, and their order — `tag_form_sections`, whose place
 * in the baseline has why it is a table and why a row has an id.
 *
 * Read whole and held in the window's store, the way the tag rules are: the tag field
 * consults them on every render, and a few dozen rows is smaller than one thumbnail.
 *
 * **One flat list, not a list per category.** A section used to be a division of a
 * category and the form drew a heading with its rows under it — two answers to "where does
 * this tag go" stacked on top of each other, where only the lower one was about tagging. A
 * row is free to hold what a category cannot now: `bikini` is General, `bare shoulders` is
 * Appearance, and both belong on the row you fill in while looking at a swimsuit. The
 * category is still what the tag *is*, which is the colour its chip is drawn in and what
 * the website shows.
 *
 * **A section has an id, and everything above this file uses it.** That is the difference
 * from the version this replaces, where the name was the identity: renaming meant deleting
 * one section and making another, and every tag on it fell quietly off the form. The same
 * lesson the tag rules learned moving off `save.json`.
 */

/** Whether a section needs any one of its dependencies on the post, or all of them. */
export type DepsMode = 'any' | 'all'

/**
 * One row of the form: its identity, what a person reads on it, and what it waits for.
 *
 * `deps` are tag **names** — the table stores ids so a rename carries the dependency and a
 * delete takes it, and this file is the one place the two spellings meet, exactly as
 * `@common/data/rules.ts` is for the rules. Empty is the common case and means no condition:
 * the row is always drawn.
 */
export type FormSection = {
  id: number
  name: string
  /**
   * Which column of the form it is drawn in — 0 left, 1 right — with `position` ordering it
   * inside that column. Two authored facts rather than one derived from the other: the side
   * used to be the parity of a single flat position, which can say everything except that
   * one column is longer than the other, and that is the only state a two-column layout
   * spends its time in. See `0004_section_sides.sql`.
   */
  side: number
  depsMode: DepsMode
  deps: string[]
}

/** Every section: the left column in its order, then the right in its own. */
export type FormSections = FormSection[]

/**
 * The whole list, by side and then position, with ties broken by name.
 *
 * The tie-break is what makes a table written by hand — every `position` left at its
 * default of 0 — come out alphabetical rather than in whatever order the rows were
 * inserted.
 *
 * The dependencies come back with the row rather than in a second read: they are part of
 * what a section *is*, the whole set is a few dozen names, and a form that had its rows
 * before it had their conditions would draw every one of them for a frame. That was a
 * nested embed and is an aggregate now — `array_agg` over a left join, so a section with
 * no dependencies comes back with an empty array rather than falling out of the result.
 */
export async function listFormSections(db: Db): Promise<FormSections> {
  const rows = await db<
    { id: number; name: string; side: number; deps_mode: string; deps: string[] }[]
  >`
    select s.id, s.name, s.side, s.deps_mode,
           coalesce(array_agg(t.name order by t.name) filter (where t.name is not null),
                    '{}'::text[]) as deps
      from tag_form_sections s
      left join tag_form_section_deps d on d.section_id = s.id
      left join tags t on t.id = d.tag_id
     group by s.id
     order by s.side, s.position, s.name`

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    // Anything but 1 is the left column, which is the side a hand-edited row should land on
    // rather than vanishing: the check constraint allows only the two.
    side: row.side === 1 ? 1 : 0,
    // Anything but 'all' is 'any', which is the safer of the two to fall back to: a
    // condition read wrong should show a row rather than hide one.
    depsMode: row.deps_mode === 'all' ? 'all' : 'any',
    deps: row.deps,
  }))
}

/**
 * What one edit to the sections is. A union rather than four functions because it crosses an
 * IPC channel and is validated on the way — one discriminated shape is one schema and one
 * handler, where four channels would be four of each saying the same thing.
 *
 * The whole-list write this replaces could not express a rename: a list of *names* has no
 * identity in it, so a name that changed read as one section deleted and another made. That
 * is exactly what ids are for.
 */
export type FormSectionEdit =
  | { do: 'create'; name: string }
  | { do: 'rename'; id: number; name: string }
  | { do: 'delete'; id: number }
  /**
   * The whole layout: both columns, each in its new order, `[left, right]`. A row's side and
   * its place in it are one arrangement and are written as one — a list of ids per column
   * says which side every row is on and where, which is what an ordered flat list could not.
   */
  | { do: 'reorder'; columns: [number[], number[]] }
  | { do: 'deps'; id: number; mode: DepsMode; names: string[] }

export type FormSectionOutcome = { ok: true } | { ok: false; error: string }

/**
 * Applies one edit. Every one of them is small and exact, which is what having ids buys:
 * a rename touches one row and every tag on it follows, where the name-keyed version had to
 * rewrite the whole category and could not carry the tags across at all.
 *
 * A new section goes on the end — `position` one past the highest — rather than into the
 * alphabet, because the order is authored and the end is where you can see what you just
 * made. That was a read and then an insert; it is one statement now, so two people naming
 * a section at once cannot both read the same highest position.
 *
 * `deps` is the one edit that can be refused for a reason outside this file: it names tags,
 * and `resolveTagIds` throws on a name the board has no row for.
 */
export async function editFormSections(
  db: Db,
  edit: FormSectionEdit
): Promise<FormSectionOutcome> {
  try {
    if (edit.do === 'create') {
      const name = normalizeFormSection(edit.name)
      if (!name) return { ok: false, error: 'Type a section name.' }

      // Onto the end of the **shorter** column, ties to the left. A new row is a row you are
      // about to fill, so it wants to be where it can be seen, and always appending to one
      // side would make every new row extend the longer column — which is the one place on
      // the form with nothing beside it.
      await db`
        with sides as (
          select s.side,
                 count(t.id) as held,
                 coalesce(max(t.position), -1) + 1 as next
            from (values (0::smallint), (1::smallint)) as s(side)
            left join tag_form_sections t on t.side = s.side
           group by s.side
        )
        insert into tag_form_sections (name, side, position)
        select ${name}, side, next from sides order by held, side limit 1`
      return { ok: true }
    }

    if (edit.do === 'rename') {
      const name = normalizeFormSection(edit.name)
      if (!name) return { ok: false, error: 'Type a section name.' }

      await db`update tag_form_sections set name = ${name} where id = ${edit.id}`
      return { ok: true }
    }

    if (edit.do === 'delete') {
      // The tags on it are not touched and are not lost: the foreign key is `on delete set
      // null`, so they go back to naming no section — which is the same answer the text
      // column gave, said structurally.
      await db`delete from tag_form_sections where id = ${edit.id}`
      return { ok: true }
    }

    if (edit.do === 'deps') {
      // One lookup for the whole list, and it throws naming anything the board has no tag
      // for — the same refusal a post write and a tag rule make, since a condition may only
      // ever name tags that exist. The panel picks from the grid, so it cannot normally
      // produce one; a stale window could.
      const ids = edit.names.length === 0 ? [] : await resolveTagIds(db, [...new Set(edit.names)])

      await db`update tag_form_sections set deps_mode = ${edit.mode} where id = ${edit.id}`

      // Replaced whole rather than diffed: a section's dependencies are a set of a few
      // names that the panel has entirely in hand, and there is no cost to losing a race
      // here the way there is on `tag_rules` — a failed insert leaves a section with no
      // condition, which shows the row rather than hiding it.
      await db`delete from tag_form_section_deps where section_id = ${edit.id}`
      if (ids.length > 0) {
        await db`
          insert into tag_form_section_deps (section_id, tag_id)
          select ${edit.id}, unnest(${ids}::int[])`
      }
      return { ok: true }
    }

    // Reorder: one statement per column rather than an update per row, the position each id
    // wants being its place in that column's array, which `with ordinality` reads straight
    // off. The side is written from the same statement, so a row that changed columns is
    // carried by the list it now appears in and needs no separate edit.
    //
    // An empty column writes nothing, which is correct rather than a gap: its rows are in
    // the other array and the statement for that one has already claimed them.
    for (const [side, ids] of edit.columns.entries()) {
      if (ids.length === 0) continue
      await db`
        update tag_form_sections s
           set side = ${side}, position = wanted.position - 1
          from unnest(${ids}::smallint[]) with ordinality as wanted(id, position)
         where s.id = wanted.id`
    }
    return { ok: true }
  } catch (error) {
    if (isUniqueViolation(error)) {
      // The unique constraint is the name, and it is the only one on the table.
      return { ok: false, error: `That is already a row on the form.` }
    }
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save.' }
  }
}
