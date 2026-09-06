import { listTagRules, setTagRule, type RuleKind, type TagRules } from '@common/data/rules'
import { normalizeRules } from '../shared/implications'
import { normalizeRecommendations } from '../shared/recommendations'
import { boardClient } from './supabase'

/**
 * The tag rules, read from and written to the board.
 *
 * They were two sections of `save.json` until they moved onto the `tag_rules` table.
 * What that buys is what a file could not give them: a rule follows the tag it names
 * through a rename, dies with it on a delete, and is the same rule on every install
 * rather than one machine's copy. What it costs is that a window that cannot reach the
 * board has no rules — the store in the window treats an unreadable set as none, so a
 * post is tagged by hand instead of not at all.
 *
 * Not cached on disk, unlike the tag index. That one is read on every keystroke of an
 * autocomplete; these are read once when the window opens, held in a module-level store
 * for the rest of the session, and re-read only when something changes them.
 *
 * Main still only stores them. Applying an implication and offering a recommendation are
 * the tag field's job, in the window — `shared/implications.ts` and
 * `shared/recommendations.ts` are those two, unchanged by the move.
 */

/** An unreachable board is no rules, never a thrown channel — the window carries on. */
export async function loadRules(kind: RuleKind): Promise<TagRules> {
  const client = boardClient()
  if (!client) return {}
  return listTagRules(client, kind)
}

/**
 * Writes one tag's whole rule and answers with the set as it now stands, so the screen
 * paints what the board holds rather than what it sent.
 *
 * The list is normalised first, by the same function that used to parse the file: it is
 * stricter than a zod schema of the same shape, holding every name to the board's own
 * `TAG_PATTERN` and keeping at most the highest `rating:` token. Sending one tag's list
 * rather than the whole map is what the panel was always doing — a rule is written about
 * the tag whose panel is open — and it is now also what the write touches.
 */
export async function saveRule(kind: RuleKind, tag: string, raw: unknown): Promise<TagRules> {
  const client = boardClient()
  if (!client) throw new Error('Not set up yet')

  // Normalised the way the trigger itself is, or the lookup below misses: `normalizeRules`
  // lowercases the keys it is given, and asking it for the name as typed would come back
  // empty — which reads as "no rule" and would delete the one being edited.
  const trigger = tag.trim().toLowerCase()
  const normalize = kind === 'implies' ? normalizeRules : normalizeRecommendations
  const names = normalize({ [trigger]: raw })[trigger] ?? []

  await setTagRule(client, kind, trigger, names)
  return listTagRules(client, kind)
}
