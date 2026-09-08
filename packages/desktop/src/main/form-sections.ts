import {
  editFormSections,
  listFormSections,
  type FormSectionEdit,
  type FormSections,
} from '@common/data/form-sections'
import { boardClient } from './supabase'

/**
 * The form sections, read from and written to the board.
 *
 * The same shape as `main/rules.ts` and for the same reasons: read once when the window
 * opens, held in a module-level store for the rest of the session, re-read only when
 * something changes them. Not cached on disk — the tag index is, being read on every
 * keystroke of an autocomplete; a few dozen section names are read once.
 *
 * On the board rather than in `save.json` because a section is a fact about the board's
 * vocabulary, like the tag rules and unlike the catalogs: the same categories divide the
 * same way on every install, and an order worked out once should not be worked out again
 * after a reinstall.
 */

/** An unreachable board is no sections, never a thrown channel — the window carries on with
 *  a form of headings and no rows, which says plainly that it cannot reach anything. */
export async function loadFormSections(): Promise<FormSections> {
  const client = boardClient()
  if (!client) return {}
  return listFormSections(client)
}

/**
 * Applies one edit and answers with the set as it now stands, so the screen paints what the
 * board holds rather than what it sent.
 *
 * One channel for five operations because they are five shapes of the same thing and the
 * union is checked on the way in. A failed edit comes back as a message beside the answer,
 * not as a thrown channel: every one of these is something the typist can fix in the field
 * still on screen — a name already taken, an empty one.
 */
export async function saveFormSections(
  edit: FormSectionEdit
): Promise<{ sections: FormSections; error?: string }> {
  const client = boardClient()
  if (!client) throw new Error('Not set up yet')

  const result = await editFormSections(client, edit)
  const sections = await listFormSections(client)
  return result.ok ? { sections } : { sections, error: result.error }
}
