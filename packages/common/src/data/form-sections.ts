import { normalizeFormSection, type TagCategory } from '@common/tags'
import { resolveTagIds } from '@common/data/shared'
import type { BooruClient } from '@common/supabase/types'

/**
 * The rows the desktop tag form draws under a category, and their order —
 * `tag_form_section`, whose migration has why it is a table and why a row has an id.
 *
 * Read whole and held in the window's store, the way the tag rules are: the tag field
 * consults them on every render of every category, and a few dozen rows is smaller than one
 * thumbnail. Keyed by category on the way out, which is the shape every caller wants —
 * nothing ever asks "which categories is `clothes` a section of".
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
 */
export async function listFormSections(client: BooruClient): Promise<FormSections> {
  const { data, error } = await client
    .from('tag_form_section')
    // The dependencies come back with the row rather than in a second read: they are part of
    // what a section *is*, the whole set is a few dozen names, and a form that had its rows
    // before it had their conditions would draw every one of them for a frame.
    .select('id, category, name, deps_mode, tag_form_section_dep(tags(name))')
    .order('category')
    .order('position')
    .order('name')
  if (error) throw new Error(`Could not read the form sections: ${error.message}`)

  const out: FormSections = {}
  for (const row of data ?? []) {
    const deps = (row.tag_form_section_dep as unknown as { tags: { name: string } | null }[]) ?? []
    ;(out[row.category as string] ??= []).push({
      id: row.id as number,
      name: row.name as string,
      // Anything but 'all' is 'any', which is the safer of the two to fall back to: a
      // condition read wrong should show a row rather than hide one.
      depsMode: row.deps_mode === 'all' ? 'all' : 'any',
      // Sorted, so a panel read twice running reads the same way.
      deps: deps
        .map((dep) => dep.tags?.name)
        .filter((name): name is string => !!name)
        .sort(),
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
 * made.
 *
 * `deps` is the one edit that can be refused for a reason outside this file: it names tags,
 * and `resolveTagIds` throws on a name the board has no row for.
 */
export async function editFormSections(
  client: BooruClient,
  edit: FormSectionEdit
): Promise<FormSectionOutcome> {
  if (edit.do === 'create') {
    const name = normalizeFormSection(edit.name)
    if (!name) return { ok: false, error: 'Type a section name.' }

    const { data: last } = await client
      .from('tag_form_section')
      .select('position')
      .eq('category', edit.category)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { error } = await client
      .from('tag_form_section')
      .insert({ category: edit.category, name, position: ((last?.position as number) ?? -1) + 1 })
    if (error) {
      // The unique constraint is `(category, name)`, so this only ever means one thing.
      if (error.code === '23505') return { ok: false, error: `${name} is already a row here.` }
      return { ok: false, error: `Could not add the section: ${error.message}` }
    }
    return { ok: true }
  }

  if (edit.do === 'rename') {
    const name = normalizeFormSection(edit.name)
    if (!name) return { ok: false, error: 'Type a section name.' }

    const { error } = await client.from('tag_form_section').update({ name }).eq('id', edit.id)
    if (error) {
      if (error.code === '23505') return { ok: false, error: `${name} is already a row here.` }
      return { ok: false, error: `Rename failed: ${error.message}` }
    }
    return { ok: true }
  }

  if (edit.do === 'delete') {
    // The tags on it are not touched and are not lost: the foreign key is `on delete set
    // null`, so they go back to naming no section — which is the same answer the text
    // column gave, said structurally.
    const { error } = await client.from('tag_form_section').delete().eq('id', edit.id)
    if (error) return { ok: false, error: `Could not remove the section: ${error.message}` }
    return { ok: true }
  }

  if (edit.do === 'deps') {
    // One lookup for the whole list, and it throws naming anything the board has no tag
    // for — the same refusal a post write and a tag rule make, since a condition may only
    // ever name tags that exist. The panel picks from the grid, so it cannot normally
    // produce one; a stale window could.
    let ids: number[]
    try {
      ids = edit.names.length === 0 ? [] : await resolveTagIds(client, [...new Set(edit.names)])
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'No such tag' }
    }

    const { error: modeError } = await client
      .from('tag_form_section')
      .update({ deps_mode: edit.mode })
      .eq('id', edit.id)
    if (modeError) return { ok: false, error: `Could not save the condition: ${modeError.message}` }

    // Replaced whole rather than diffed: a section's dependencies are a set of a few names
    // that the panel has entirely in hand, and there is no cost to losing a race here the
    // way there is on `tag_rules` — nothing between the delete and the insert would read
    // it, and a failed insert leaves a section with no condition, which shows the row
    // rather than hiding it.
    const { error: clearError } = await client
      .from('tag_form_section_dep')
      .delete()
      .eq('section_id', edit.id)
    if (clearError) return { ok: false, error: `Could not clear the condition: ${clearError.message}` }

    if (ids.length === 0) return { ok: true }

    const { error } = await client
      .from('tag_form_section_dep')
      .insert(ids.map((tag_id) => ({ section_id: edit.id, tag_id })))
    if (error) return { ok: false, error: `Could not save the condition: ${error.message}` }
    return { ok: true }
  }

  // Reorder. One update per row rather than an upsert of the lot: an upsert would have to
  // send `category` and `name` back for every row to satisfy the not-nulls, which is a
  // rename waiting to happen if the list in hand is one edit stale. A handful of rows.
  for (const [position, id] of edit.ids.entries()) {
    const { error } = await client
      .from('tag_form_section')
      .update({ position })
      .eq('id', id)
      .eq('category', edit.category)
    if (error) return { ok: false, error: `Could not reorder: ${error.message}` }
  }
  return { ok: true }
}
