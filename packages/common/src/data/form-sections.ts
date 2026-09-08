import { normalizeFormSection, type TagCategory } from '@common/tags'
import { resolveTagIds } from '@common/data/shared'
import { isUniqueViolation, type Db } from '@common/db'

/**
 * The rows the desktop tag form draws under a category, and their order —
 * `tag_form_sections`, whose place in the baseline has why it is a table and why a row
 * has an id.
 *
 * Read whole and held in the window's store, the way the tag rules are: the tag field
 * consults them on every render of every category, and a few dozen rows is smaller than
 * one thumbnail. Keyed by category on the way out, which is the shape every caller wants
 * — nothing ever asks "which categories is `clothes` a section of".
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
export type FormSection = { id: number; name: string; depsMode: DepsMode; deps: string[] }

/** `{ category: [section, …] }`, each list in the order the form draws it. */
export type FormSections = Record<string, FormSection[]>

/**
 * Every section, by category, in position order with ties broken by name.
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
    { id: number; category: string; name: string; deps_mode: string; deps: string[] }[]
  >`
    select s.id, s.category, s.name, s.deps_mode,
           coalesce(array_agg(t.name order by t.name) filter (where t.name is not null),
                    '{}'::text[]) as deps
      from tag_form_sections s
      left join tag_form_section_deps d on d.section_id = s.id
      left join tags t on t.id = d.tag_id
     group by s.id
     order by s.category, s.position, s.name`

  const out: FormSections = {}
  for (const row of rows) {
    ;(out[row.category] ??= []).push({
      id: row.id,
      name: row.name,
      // Anything but 'all' is 'any', which is the safer of the two to fall back to: a
      // condition read wrong should show a row rather than hide one.
      depsMode: row.deps_mode === 'all' ? 'all' : 'any',
      deps: row.deps,
    })
  }
  return out
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
  | { do: 'create'; category: TagCategory; name: string }
  | { do: 'rename'; id: number; name: string }
  | { do: 'delete'; id: number }
  | { do: 'reorder'; category: TagCategory; ids: number[] }
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

      await db`
        insert into tag_form_sections (category, name, position)
        select ${edit.category}, ${name},
               coalesce(max(position), -1) + 1 from tag_form_sections
         where category = ${edit.category}`
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

    // Reorder. One statement over the whole list rather than an update per row: the
    // position each id wants is its place in the array, which `with ordinality` reads
    // straight off. `category` is still checked, so a stale window cannot renumber rows
    // under a heading it wasn't looking at.
    await db`
      update tag_form_sections s
         set position = wanted.position - 1
        from unnest(${edit.ids}::smallint[]) with ordinality as wanted(id, position)
       where s.id = wanted.id and s.category = ${edit.category}`
    return { ok: true }
  } catch (error) {
    if (isUniqueViolation(error)) {
      // The unique constraint is `(category, name)`, so this only ever means one thing.
      return { ok: false, error: `That is already a row on this category.` }
    }
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save.' }
  }
}
