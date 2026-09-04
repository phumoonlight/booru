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
 * a rating spelled among tags is what `?query=` carries — so the file stays one list per
 * tag and the screen stays one row per rule. An implied rating is a **floor**, never a
 * setting: `panties → rating:e2` will raise a general post to E2 and will not touch one
 * already at E5, because the tag that earned the higher rating is rarely the tag whose
 * rule fired last.
 *
 * The rules are this machine's, not the board's: there is no table for them and no way
 * to write one from here, and a rule is only ever consulted while a queue is being
 * tagged. The board sees nothing but the tags and the rating it would have seen if you
 * had set every one of them yourself.
 *
 * Pure, and in `shared/` because both sides need it: main normalises what it stores,
 * the window applies it as you type.
 */
export type ImplicationRules = Record<string, string[]>

/**
 * The stored shape, parsed rather than trusted — `save.json` is a file the user is
 * invited to hand-edit, so anything that isn't a rule is dropped rather than allowed to
 * become a tag nobody typed. This is the validation for the IPC channel too: it is
 * stricter than a zod schema of the same shape, since a name must also match
 * `TAG_PATTERN`, which is the rule the board itself enforces.
 *
 * Keys come out sorted, so the file stays something you can read down, and a rule keeps
 * at most one `rating:` token — the highest, since a floor of E1 under a floor of E3 is
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

/**
 * An implied rating and the tag that asked for it. The tag is carried because the queue
 * says so out loud — a rating that moves on its own with nothing naming the reason is
 * the kind of thing you go looking through rules for.
 */
export type ImpliedRating = { rating: Rating; from: string }

/**
 * Everything `names` drags in with it: the tags, in the order they were discovered and
 * never one that was already in `names`, and the highest rating any rule along the way
 * asked for.
 *
 * Rules chain — `school_swimsuit → one-piece_swimsuit → swimsuit` adds both, and a
 * rating on either of them counts — because the alternative is spelling every
 * consequence into every rule and keeping them in step by hand. `seen` makes a cycle
 * terminate instead of hanging the window, so a pair of rules that imply each other is
 * merely useless rather than fatal.
 */
function resolve(
  names: string[],
  rules: ImplicationRules
): { tags: string[]; rating: ImpliedRating | null } {
  const seen = new Set(names)
  const tags: string[] = []
  let rating: ImpliedRating | null = null
  const queue = [...names]

  while (queue.length > 0) {
    const name = queue.shift() as string
    for (const entry of rules[name] ?? []) {
      // A rating is a consequence, not a tag: it is never queued, so nothing implies
      // anything by way of one
      const implied = asRating(entry)
      if (implied) {
        // Strictly higher, so a tie keeps the tag found first and the reason shown
        // doesn't shuffle between two tags asking for the same thing
        if (!rating || RATINGS.indexOf(implied) > RATINGS.indexOf(rating.rating)) {
          rating = { rating: implied, from: name }
        }
        continue
      }
      if (seen.has(entry)) continue
      seen.add(entry)
      tags.push(entry)
      queue.push(entry)
    }
  }
  return { tags, rating }
}

/** The implied tags alone — what the field lists and what the upload appends. */
export function impliedTags(names: string[], rules: ImplicationRules): string[] {
  return resolve(names, rules).tags
}

/**
 * The highest rating these tags ask for and the tag that asks for it, or null if no rule
 * along the way named one.
 */
export function impliedRating(names: string[], rules: ImplicationRules): ImpliedRating | null {
  return resolve(names, rules).rating
}

/**
 * The rating a row should be left on. Raise only: an implied rating is the *least* a set
 * of tags is worth, so it lifts a row that is too tame and never pulls one down. Tagging
 * an E5 post `panties` must not talk it back to E2 — and the rating you set by hand
 * outranks every rule, which is only true while the rules can't lower it.
 */
export function raisedRating(current: Rating, implied: ImpliedRating | null): Rating {
  return higherRating(current, implied?.rating ?? null) ?? current
}
