import { TAG_PATTERN } from '@common/tags'

/**
 * Tag recommendations: "a post tagged `panties` is often also tagged `black_panties` or
 * `bow_panties`". The other half of the pair to `shared/implications.ts`, and deliberately
 * the opposite kind of rule.
 *
 * An implication is a fact — `white_bra` *is* a bra, so the tag goes on whether or not
 * anyone looks. A recommendation is a reminder: the broad tag is on the image and the
 * question is which of the narrower ones apply, which only the person looking at the
 * picture can answer. So these were **offered, never applied**: chips under the tag box,
 * nothing added until one was pressed. Nothing offers them any more — the form that did went
 * with the posts (0012) — and the rules are kept for a later use.
 *
 * That is also why a rating cannot be recommended. A rating is not a chip you press, and
 * an implied rating already exists for the case where it should move on its own — here a
 * `rating:e2` token simply fails `TAG_PATTERN` on the colon and is dropped with the rest
 * of the nonsense.
 *
 * Same shape and the same table: the `'recommends'` rows of `tag_rules`.
 */
export type RecommendationRules = Record<string, string[]>

/**
 * The shape, parsed rather than trusted, and the validation for the IPC channel that
 * writes a rule — stricter than a zod schema of the same shape would be, since every name
 * must match the board's own `TAG_PATTERN`. Keys come out sorted, which costs nothing and
 * makes a map read down the page twice running read the same way.
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
