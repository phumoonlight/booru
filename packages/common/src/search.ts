// Ratings, and how a tag name is read aloud — pure, shared by server components, client
// components and the desktop app.
//
// This was the `?query=` grammar: tags, `-tag`, `rating:` and `start:` metatags, and the two
// hrefs that spelled the listing's address. The search went with the boards (0012). What
// is left is the part of it everything else leaned on — the rating scale, and the one token
// form (`rating:r18`) the tag rules still spell an implied rating with.

/** Display form of a tag name — underscores are word separators, not characters. */
export function tagLabel(name: string): string {
  return name.replace(/_/g, ' ')
}

/**
 * **A rating is stored as one letter and written as a word.** `collections.rating` holds
 * `g` or `r`; a tag rule spells an implied one `rating:r18`, and `asRating` / `ratingToken` are
 * the only two places the two forms meet — `asRating` reads both, `ratingToken` writes the
 * name. The website's collection filter spells it the same word, `?rating=r18`.
 *
 * The column is the reason. It is free-form text with no check constraint, repeated on
 * every row and every index entry, and the word carries nothing the letter doesn't —
 * `RATING_LABEL` is what a person actually reads, and it has never been the stored
 * value. The URL is the opposite case: `?rating=r` is an address nobody can read
 * back.
 *
 * So `Rating` is the stored code everywhere in the code, and `RATING_NAME` is the one
 * translation, used only at the edge of a URL or a rule.
 *
 * **Two tiers, pixiv-style.** It was four — `g`, `s`, `q`, `e`, Danbooru's scale — and
 * the middle two were a judgement nobody could make the same way twice: the line between
 * sensitive and questionable moved with the mood of whoever was tagging, and the only
 * thing the board did with any of it was decide whether an image is behind the setting.
 * That is one bit, so it is one bit. How sexual a post actually *is* is what tags are
 * for, which is where a description of the picture belongs anyway.
 *
 * A letter rather than a `boolean r18` column, which would read more honestly today and
 * would foreclose a third tier — pixiv itself has R-18G. The enum costs one character
 * and keeps the door open; the column is free-form text, so that door is a code change.
 */
export const RATINGS = ['g', 'r'] as const

export type Rating = (typeof RATINGS)[number]

/** How a rating is written in a query. `rating:g` is read too, but never written. */
export const RATING_NAME: Record<Rating, string> = {
  g: 'general',
  r: 'r18',
}

/** The code a query name means, built from `RATING_NAME` so the two cannot drift. */
const RATING_BY_NAME: Record<string, Rating> = Object.fromEntries(
  RATINGS.map((rating) => [RATING_NAME[rating], rating])
)

/** Display form — what a person reads, on a facet or a post page. */
export const RATING_LABEL: Record<Rating, string> = {
  g: 'General',
  r: 'R-18',
}

// A traffic light with two lamps. Both hexes are kept from the four-tier scale — green
// was General and red was Explicit — so a board that has been re-rated looks like the
// one you knew rather than a new palette to learn, the same courtesy the tag categories
// got through their re-cuts.
export const RATING_COLOR: Record<Rating, string> = {
  g: 'text-[#35c64a]',
  r: 'text-[#ff5d5f]',
}

/**
 * The adult tier. It stays out of the sitemap and out of search-engine results
 * (`robots: noindex`), and the website keeps it out of the listing until a visitor turns
 * it on in Settings — see `src/lib/nsfw.ts`. A shelf is still reachable by its own URL
 * either way: this is what the gallery volunteers, not access control, and there are no
 * accounts here to make it anything more.
 *
 * One tier rather than two now, which is the whole of what collapsing the scale changed
 * downstream — every consumer of this list works unchanged and is easier to reason
 * about, because "restricted" and "R-18" are finally the same word.
 */
export const RESTRICTED_RATINGS: readonly Rating[] = ['r']

export function isRestricted(rating: Rating): boolean {
  return RESTRICTED_RATINGS.includes(rating)
}

/** The tiers shown to someone who has not asked for the adult ones. */
export const SAFE_RATINGS: readonly Rating[] = RATINGS.filter((r) => !isRestricted(r))

export const RATING_PREFIX = 'rating:'

export function ratingToken(rating: Rating): string {
  return `${RATING_PREFIX}${RATING_NAME[rating]}`
}

/**
 * `rating:` on a token, or null if it isn't one. Exported because the desktop uploader's
 * implication rules spell an implied rating with the same token in the same list as the
 * implied tags — one grammar for "a rating written among tags", not two.
 */
export function asRating(token: string): Rating | null {
  if (!token.startsWith(RATING_PREFIX)) return null
  const value = token.slice(RATING_PREFIX.length)
  // Both spellings are accepted: `rating:r18` is what every link and chip the app builds
  // says, and `rating:r` is what someone typing into the box will reach for once they
  // have seen the column. Only the reading is loose — `ratingToken` still writes the
  // name, so the two forms never both end up in a URL the app produced.
  return (
    RATING_BY_NAME[value] ??
    ((RATINGS as readonly string[]).includes(value) ? (value as Rating) : null)
  )
}
