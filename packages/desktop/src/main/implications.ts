import { clearSection, readSection, writeSection } from './save-file'
import { normalizeRules, type ImplicationRules } from '../shared/implications'

/**
 * The implication rules as `save.json` holds them — a plain `{ tag: [implied, …] }`
 * object under `implications`, which is a shape worth hand-editing when there are a
 * hundred of them and the screen is one row at a time.
 *
 * Main only stores them. Applying a rule is the tag field's job, in the window, where
 * the tag it adds is a chip you can see and remove — see `shared/implications.ts`.
 */
export function loadImplications(): ImplicationRules {
  return normalizeRules(readSection<unknown>('implications'))
}

/**
 * Normalises on the way in and answers with what was actually stored, so the screen
 * paints the rules the file holds rather than the ones it sent — a name the board would
 * refuse is dropped here, and silently keeping it on screen would be a lie.
 *
 * An empty set takes the section out rather than leaving `"implications": {}` behind:
 * deleting your last rule should leave the file as it was before you had any.
 */
export function saveImplications(input: unknown): ImplicationRules {
  const next = normalizeRules(input)
  if (Object.keys(next).length === 0) clearSection('implications')
  else writeSection('implications', next)
  return next
}
