import { TAG_PATTERN } from '@common/tags'

/**
 * Tag recommendations: "a post tagged `panties` is often also tagged `black_panties` or
 * `bow_panties`". The other half of the pair to `shared/implications.ts`, and deliberately
 * the opposite kind of rule.
 *
 * An implication is a fact — `white_bra` *is* a bra, so the tag goes on whether or not
 * anyone looks. A recommendation is a reminder: the broad tag is on the image and the
 * question is which of the narrower ones apply, which only the person looking at the
 * picture can answer. So these are **offered, never applied**: they appear under the tag
 * box as chips to press, nothing is added until one is, and a post uploaded with none of
 * them pressed carries none of them.
 *
 * That is also why a rating cannot be recommended. A rating is not a chip you press, and
 * an implied rating already exists for the case where it should move on its own — here a
 * `rating:e2` token simply fails `TAG_PATTERN` on the colon and is dropped with the rest
 * of the nonsense.
 *
 * Same file, same shape, same machine: the `recommendations` section of `save.json`.
 */
export type RecommendationRules = Record<string, string[]>

/**
 * The stored shape, parsed rather than trusted — `save.json` is a file the user is
 * invited to hand-edit. Also the validation for the IPC channel, and stricter than a zod
 * schema of the same shape would be, since every name must match the board's own
 * `TAG_PATTERN`. Keys come out sorted so the file stays readable down the page.
 */
export function normalizeRecommendations(input: unknown): RecommendationRules {
  const out: RecommendationRules = {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out

  for (const key of Object.keys(input as Record<string, unknown>).sort()) {
    const tag = key.trim().toLowerCase()
    if (!TAG_PATTERN.test(tag)) continue

    const raw = (input as Record<string, unknown>)[key]
    if (!Array.isArray(raw)) continue

    const suggests: string[] = []
    for (const entry of raw) {
      if (typeof entry !== 'string') continue
      const name = entry.trim().toLowerCase()
      // A tag recommending itself would be a chip that adds what you already have
      if (!TAG_PATTERN.test(name) || name === tag || suggests.includes(name)) continue
      suggests.push(name)
    }

    // A rule that suggests nothing is not a rule; that is also how the last ✕ deletes one
    if (suggests.length > 0) out[tag] = suggests
  }
  return out
}

/**
 * What to offer for the tags currently on a post, minus everything already on it.
 *
 * One level deep, unlike implications: `panties → black_panties` and
 * `black_panties → lace_trim` do not combine, because a chain of *maybes* is how a
 * three-tag post ends up under thirty chips nobody reads. What a chip adds is a tag like
 * any other, so pressing it brings its own recommendations with it on the next render —
 * the chain is walked by choosing, one step at a time.
 *
 * `already` is the whole set the post is going to carry, implied tags included: a chip
 * offering something the rules are adding anyway is a press that does nothing.
 */
export function recommendedTags(
  names: string[],
  rules: RecommendationRules,
  already: string[] = names
): string[] {
  const have = new Set(already)
  const found: string[] = []

  for (const name of names) {
    for (const suggestion of rules[name] ?? []) {
      if (have.has(suggestion)) continue
      have.add(suggestion)
      found.push(suggestion)
    }
  }
  return found
}
