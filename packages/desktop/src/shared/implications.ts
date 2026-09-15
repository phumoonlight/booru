import { asRating, RATINGS, ratingToken, type Rating } from '@common/search'
import { TAG_PATTERN } from '@common/tags'

/**
 * Tag implications: "anything tagged `white_bra` is also tagged `bra`". Danbooru's name
 * for the idea, and the reason it exists here is the one it exists there for — the
 * specific tag is the one you remember to type, and the broad one it belongs under is
 * the one you forget, so a search for `bra` misses half the posts that are of a bra.
 *
 * A rule may also imply a **rating**, written as a `rating:e2` token in the same list as
 * the implied tags rather than in a field of its own. That is the board's own grammar —
 * a rating spelled among tags is what `?query=` carries — so a rule stays one list per
 * tag and the screen stays one row per rule. The table cannot store it as a row, the
 * thing implied not being a tag, so it is `tags.implied_rating` and this list is where it
 * is folded back in. An implied rating is a **floor**, never a
 * setting: `panties → rating:e2` will raise a general post to E2 and will not touch one
 * already at E5, because the tag that earned the higher rating is rarely the tag whose
 * rule fired last.
 *
 * The rules are the board's — `tag_rules`, read and written through
 * `@common/data/rules.ts`. Nothing applies one any more: the upload form that did went with
 * the posts (0012), and the rules are kept, edited and drawn for a later use. What applying
 * one meant — transitive, cycle-safe, a rating only ever raised — is in git history beside
 * the form that did it.
 *
 * What is here is pure, and in `shared/` because both sides need it: main normalises what
 * it stores, and the window reads the type.
 */
export type ImplicationRules = Record<string, string[]>

/**
 * The shape, parsed rather than trusted. It is the validation for the IPC channel that
 * writes a rule — stricter than a zod schema of the same shape, since a name must also
 * match `TAG_PATTERN`, which is the rule the board itself enforces — and it still takes a
 * whole map, because it long predates the write being one tag at a time and a map of one
 * is the cheapest way to ask it about a single list.
 *
 * Keys come out sorted, which costs nothing and makes a map read twice read the same
 * way, and a rule keeps at most one `rating:` token — the highest, since a floor of E1 under a floor of E3 is
 * not a second rule, it is the same one written twice.
 */
export function normalizeRules(input: unknown): ImplicationRules {
  const out: ImplicationRules = {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out

  for (const key of Object.keys(input as Record<string, unknown>).sort()) {
    const tag = key.trim().toLowerCase()
    if (!TAG_PATTERN.test(tag)) continue

    const raw = (input as Record<string, unknown>)[key]
    if (!Array.isArray(raw)) continue

    const implies: string[] = []
    let rating: Rating | null = null
    for (const entry of raw) {
      if (typeof entry !== 'string') continue
      const name = entry.trim().toLowerCase()

      const implied = asRating(name)
      if (implied) {
        rating = higherRating(rating, implied)
        continue
      }

      // A tag implying itself is the one rule that can never do anything
      if (!TAG_PATTERN.test(name) || name === tag || implies.includes(name)) continue
      implies.push(name)
    }
    if (rating) implies.push(ratingToken(rating))

    // A rule that implies nothing is not a rule; that is also how the last ✕ deletes one
    if (implies.length > 0) out[tag] = implies
  }
  return out
}

/** The higher of the two on the `general → e5` scale, either of which may be absent. */
function higherRating(a: Rating | null, b: Rating | null): Rating | null {
  if (!a) return b
  if (!b) return a
  return RATINGS.indexOf(b) > RATINGS.indexOf(a) ? b : a
}
