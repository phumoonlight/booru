import { createRuleStore } from './rule-store'
import type { FormSectionEdit, FormSections } from '@common/data/form-sections'

/**
 * Which rows each category has in the tag form, and in what order.
 *
 * The same store the tag rules use — read once for the whole window, held outside React —
 * because the reason is the same: the tag field consults them on every render of every
 * category row, and state threaded down from `App` would be a prop forwarded through three
 * components whose only job is to forward it.
 *
 * One write, taking an edit rather than a list: a section has an id now, so creating,
 * renaming, deleting and reordering are four different things done to one row rather than
 * four spellings of "the list is now this". A name list could not have said which rename
 * was a rename.
 */
const store = createRuleStore(
  () => window.api.listFormSections(),
  async (edit: FormSectionEdit) => {
    const { sections, error } = await window.api.saveFormSections(edit)
    // Thrown so the store puts the board's answer back and says so, the way a failed rule
    // write does — the panel's own message is the `error` it reads off the last attempt.
    if (error) {
      lastError = error
      throw new Error(error)
    }
    lastError = null
    return sections
  },
  {} as FormSections
)

/**
 * Why the last edit was refused, or null. Held beside the store rather than in it because
 * it is the one thing here that is about an *attempt* and not about the board — the store's
 * job is to hold what the board says, and a name already taken is not that.
 */
let lastError: string | null = null

export const useFormSections = store.use
export const useFormSectionsSaving = store.useSaving
export const reloadFormSections = store.reload

/**
 * Applies one edit. Answers with the message it failed with, or null.
 *
 * Two ways to fail and both have to land here. A refusal the board explains — a name
 * already taken, a tag it has no row for — comes back as `error` on the answer. A thrown
 * rejection is everything else: an unconfigured bundle, a dead connection, a re-read that
 * did not come back. Catching the second without recording it reported a failed edit as a
 * success and cleared the message that would have said otherwise.
 */
export async function editFormSections(edit: FormSectionEdit): Promise<string | null> {
  lastError = null
  await store.save(edit).catch((error: unknown) => {
    // The refusal path has already written its own, better message; only an unexplained
    // throw needs one made up for it.
    lastError ??= error instanceof Error ? error.message : 'Could not save the section.'
  })
  return lastError
}
