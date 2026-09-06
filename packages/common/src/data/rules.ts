import { asRating, RATINGS, ratingToken, type Rating } from '@common/search'
import { resolveTagIds } from '@common/data/shared'
import type { BooruClient } from '@common/supabase/types'

/**
 * The tag rules, on the board rather than in a file on one machine.
 *
 * Two kinds, one table (`20260906140000_tag_rules.sql` has why): an **implication** is
 * applied by itself — `white_bra` means the post is also a `bra` — and a
 * **recommendation** is only offered, as a chip to press. What the app does with a row
 * is the whole difference; the row is the same shape either way, so `kind` is a column
 * and this file is one set of functions.
 *
 * They read and write **names**, not ids, because everything above this line is written
 * in names: the rule store the tag field consults on every keystroke, the map the rule
 * diagram draws, the picker on the Tags screen. The table stores ids so a rename carries
 * its rules and a delete takes them — that is the point of moving them here — and this
 * is the one place the two spellings meet.
 */

export type RuleKind = 'implies' | 'recommends'

/**
 * What the `kind` column holds. The table stores a number and everything above this file
 * says the word — the same split as the ids underneath the names, and for the same
 * reason: a screen, an IPC channel and a rule map read better in words, and the column is
 * a discriminator with exactly two values.
 *
 * These two numbers appear nowhere else. The check constraint in the migration is the
 * other half of the pair, so adding a third kind is a line here and a line there.
 */
export const RULE_KIND: Record<RuleKind, number> = { implies: 0, recommends: 1 }

/** `{ trigger: [implied, …] }`, the shape both rule sets have had all along. */
export type TagRules = Record<string, string[]>

/** What the embed above hands back: a joined row with a name on each side. */
type RuleRow = {
  tag: { name: string } | null
  target: { name: string } | null
}

/**
 * Every rule of one kind, keyed by the tag that triggers it.
 *
 * Read whole, never per tag: the window keeps the whole set in memory because the tag
 * field consults it while you type, and a few hundred edges is smaller than one page of
 * the gallery. Sorted on both axes so the rule diagram and the panels draw the same
 * order twice running.
 *
 * For implications the rating floors are folded back in as `rating:` tokens in the same
 * lists, which is the shape `save.json` had and the shape every helper above this
 * expects. The column they come from is `tags.implied_rating` — one per tag, since a
 * floor under a floor is the same rule written twice.
 */
export async function listTagRules(client: BooruClient, kind: RuleKind): Promise<TagRules> {
  const { data, error } = await client
    .from('tag_rules')
    // Both sides point at `tags`, so PostgREST is told which constraint each embed
    // follows. The names are pinned in the migration for exactly this.
    .select('tag:tags!tag_rules_tag_id_fkey(name), target:tags!tag_rules_target_tag_id_fkey(name)')
    .eq('kind', RULE_KIND[kind])
  if (error) throw new Error(`Could not read the tag rules: ${error.message}`)

  const out: TagRules = {}
  for (const row of (data ?? []) as unknown as RuleRow[]) {
    const tag = row.tag?.name
    const target = row.target?.name
    if (!tag || !target) continue
    ;(out[tag] ??= []).push(target)
  }

  // Before the floors go on, so a rating stays at the end of its list the way
  // `normalizeRules` kept it — the tags are the list, the rating is the consequence
  // hanging off the end of it, and a `rating:` token sorted in among the names would read
  // as one of them
  for (const tag of Object.keys(out)) out[tag].sort()

  if (kind === 'implies') {
    const { data: floors, error: floorError } = await client
      .from('tags')
      .select('name, implied_rating')
      .not('implied_rating', 'is', null)
    if (floorError) throw new Error(`Could not read the implied ratings: ${floorError.message}`)

    for (const row of floors ?? []) {
      // The column holds the letter; the list above it holds the token. This is where the
      // one becomes the other.
      const rating = storedRating(row.implied_rating)
      if (!rating) continue
      ;(out[row.name as string] ??= []).push(ratingToken(rating))
    }
  }

  return sortedByKey(out)
}

/**
 * Makes `names` one tag's whole rule of that kind, adding the edges that are new and
 * dropping the ones that are gone. An empty list deletes the rule, which is how the last
 * ✕ and the last un-tick remove one.
 *
 * A `rating:` token in `names` is not an edge — it is the tag's rating floor, and it is
 * written to `tags.implied_rating` instead. Only implications have one; a token handed to
 * a recommendation is dropped, the way `TAG_PATTERN` used to drop it on its colon.
 *
 * Diffed rather than deleted-and-reinserted because there is no transaction here: a
 * delete that lands followed by an insert that doesn't would take the rule with it, and
 * a rule that only reorders should write nothing at all.
 */
export async function setTagRule(
  client: BooruClient,
  kind: RuleKind,
  tag: string,
  names: string[]
): Promise<void> {
  const wantedNames: string[] = []
  let floor: string | null = null
  for (const name of names) {
    const rating = asRating(name)
    if (rating) {
      if (kind === 'implies') floor = rating
      continue
    }
    if (name !== tag && !wantedNames.includes(name)) wantedNames.push(name)
  }

  // One lookup for the trigger and its targets together, and it throws naming anything
  // the board has no tag for — the same refusal a post write makes, since a rule may only
  // ever name tags that exist. The trigger comes back first because it went in first.
  const [tagId, ...targetIds] = await resolveTagIds(client, [tag, ...wantedNames])
  const wanted = new Set(targetIds)

  const { data: stored, error: readError } = await client
    .from('tag_rules')
    .select('target_tag_id')
    .eq('tag_id', tagId)
    .eq('kind', RULE_KIND[kind])
  if (readError) throw new Error(`Could not read the tag rule: ${readError.message}`)

  const have = new Set((stored ?? []).map((row) => row.target_tag_id as number))
  const added = [...wanted].filter((id) => !have.has(id))
  const dropped = [...have].filter((id) => !wanted.has(id))

  if (added.length > 0) {
    const { error } = await client
      .from('tag_rules')
      .insert(
        added.map((target_tag_id) => ({ tag_id: tagId, kind: RULE_KIND[kind], target_tag_id }))
      )
    if (error) throw new Error(`Could not save the tag rule: ${error.message}`)
  }
  if (dropped.length > 0) {
    const { error } = await client
      .from('tag_rules')
      .delete()
      .eq('tag_id', tagId)
      .eq('kind', RULE_KIND[kind])
      .in('target_tag_id', dropped)
    if (error) throw new Error(`Could not save the tag rule: ${error.message}`)
  }

  if (kind === 'implies') {
    const { error } = await client.from('tags').update({ implied_rating: floor }).eq('id', tagId)
    if (error) throw new Error(`Could not save the implied rating: ${error.message}`)
  }
}

/**
 * `tags.implied_rating` as it is stored: the letter, the way `posts.rating` holds one, not
 * the `rating:explicit` token a query spells. `asRating` reads tokens and returns null for
 * a bare `e`, which is right for a query and wrong for this column — reading the column
 * through it silently dropped every floor on the way out, so a rating could be set and
 * never came back.
 *
 * Free-form text with no check constraint, so an unreadable value is no floor rather than
 * a crash.
 */
function storedRating(value: unknown): Rating | null {
  return typeof value === 'string' && (RATINGS as readonly string[]).includes(value)
    ? (value as Rating)
    : null
}

/** Keys in order, so a map read down the page reads the same way every time. */
function sortedByKey(rules: TagRules): TagRules {
  const out: TagRules = {}
  for (const tag of Object.keys(rules).sort()) out[tag] = rules[tag]
  return out
}
