import { BOARD, type Board } from '@common/board'

// Pure query-string helpers — shared by server components and the client search bar.
// URL is the state: /posts?query=blue_hair+solo+-photo&from=900

/** The search param's name. Read it from here so the URL only spells it in one place. */
export const SEARCH_PARAM = 'query'

export type ParsedQuery = {
  include: string[]
  exclude: string[]
}

/** Splits a raw query string into include/exclude lists. `-tag` means exclude. */
export function parseSearchQuery(raw: string): ParsedQuery {
  const include: string[] = []
  const exclude: string[] = []

  for (const token of raw.toLowerCase().split(/\s+/).filter(Boolean)) {
    const negated = token.startsWith('-')
    const name = negated ? token.slice(1) : token
    if (!name) continue
    const bucket = negated ? exclude : include
    if (!bucket.includes(name)) bucket.push(name)
  }

  return { include, exclude }
}

export function formatSearchQuery({ include, exclude }: ParsedQuery): string {
  return [...include, ...exclude.map((t) => `-${t}`)].join(' ')
}

/** Every token as it appears in the query, for chip rendering. */
export function queryTokens(raw: string): { name: string; negated: boolean }[] {
  const { include, exclude } = parseSearchQuery(raw)
  return [
    ...include.map((name) => ({ name, negated: false })),
    ...exclude.map((name) => ({ name, negated: true })),
  ]
}

/** Display form of a tag name — underscores are word separators, not characters. */
export function tagLabel(name: string): string {
  return name.replace(/_/g, ' ')
}

/** Adds a tag to the query, replacing any existing entry for the same name. */
export function withTag(raw: string, tag: string, mode: 'include' | 'exclude' = 'include'): string {
  const { include, exclude } = parseSearchQuery(raw)
  const next: ParsedQuery = {
    include: include.filter((t) => t !== tag),
    exclude: exclude.filter((t) => t !== tag),
  }
  if (mode === 'include') next.include.push(tag)
  else next.exclude.push(tag)
  return formatSearchQuery(next)
}

export function withoutTag(raw: string, tag: string): string {
  const { include, exclude } = parseSearchQuery(raw)
  return formatSearchQuery({
    include: include.filter((t) => t !== tag),
    exclude: exclude.filter((t) => t !== tag),
  })
}

/** Where the gallery lives. `/` is the front door and shows no posts. */
export const POSTS_PATH = BOARD.post.path

/**
 * Search URL for a query. That is the whole address now: where the listing starts
 * travels inside the query as a `start:` metatag, so there is no second param to keep
 * in step and nothing to forget to carry when a link is built.
 *
 * **The board is the other half of the address**, and it is an argument rather than a
 * second function for the same reason the query is not two params: `/ai-posts` is the
 * same listing of the same shape reading a different table, so a second `aiSearchHref`
 * would be this file's grammar written twice and one of the two would fall behind. It
 * defaults to the gallery, so every link built before the second board existed still
 * points where it did.
 */
export function searchHref(query: string, board: Board = 'post'): string {
  const path = BOARD[board].path
  const trimmed = query.trim()
  if (!trimmed) return path
  const params = new URLSearchParams()
  params.set(SEARCH_PARAM, trimmed)
  return `${path}?${params.toString()}`
}

/**
 * A post's own URL, carrying the search it was opened from.
 *
 * The same `?query=` string the listing uses, on a different path: a post reached from
 * `1girl blue_hair` is being read *inside* that search, so its neighbours are that
 * search's neighbours and the way back is that listing rather than the whole gallery.
 * Spelled here for the reason `searchHref` is — a link that forgets to carry the query
 * silently drops you out of the search you were in, which is a bug nobody reports.
 */
export function postHref(id: number, query = '', board: Board = 'post'): string {
  const path = `${BOARD[board].path}/${id}`
  const trimmed = query.trim()
  if (!trimmed) return path
  const params = new URLSearchParams()
  params.set(SEARCH_PARAM, trimmed)
  return `${path}?${params.toString()}`
}

/**
 * The query as it arrives in a page's `searchParams`. The whole address of a listing is
 * one string — tags, ratings and the `start:` cursor together — so there is only ever
 * this one param to read, on the listing and on a post alike.
 */
export function readQuery(params: Record<string, string | string[] | undefined>): string {
  const raw = params[SEARCH_PARAM]
  return typeof raw === 'string' ? raw.trim() : ''
}

// ── Rating metatags ────────────────────────────────────────────────────────────
// `rating:r18` narrows the search to that rating; `-rating:r18` drops it.
// They travel in the same `?query=` string as ordinary tags (Danbooru convention),
// so the search bar, chips and tag links need no special cases — only the data
// layer splits them back out.

/**
 * **A rating is stored as one letter and written as a word.** `posts.rating` holds `g`
 * or `r`; the chips and every link the app builds spell `rating:general`, and `asRating`
 * / `ratingToken` are the only two places the two forms meet. A query typed by hand may
 * use either — `asRating` reads both, `ratingToken` writes the name.
 *
 * The column is the reason. It is free-form text with no check constraint, repeated on
 * every row and every index entry, and the word carries nothing the letter doesn't —
 * `RATING_LABEL` is what a person actually reads, and it has never been the stored
 * value. The URL is the opposite case: `?query=rating:r` is a query nobody can read
 * back, and a saved query is a string somebody keeps.
 *
 * So `Rating` is the stored code everywhere in the code, and `RATING_NAME` is the one
 * translation, used only at the edge of a query string.
 *
 * **Two tiers, pixiv-style.** It was four — `g`, `s`, `q`, `e`, Danbooru's scale — and
 * the middle two were a judgement nobody could make the same way twice: the line between
 * sensitive and questionable moved with the mood of whoever was tagging, and the only
 * thing the board did with any of it was decide whether a post is behind the setting.
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
 * it on in Settings — see `src/lib/nsfw.ts`. A post is still reachable by its own URL
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

// ── The cursor metatag ─────────────────────────────────────────────────────────
// `start:900` means "begin at post 900 and go older", which is what a bookmark on a
// thumbnail writes and what a saved query carries. It rides in `?query=` like the
// rating metatags for the same reason: the search bar already renders every token as a
// removable chip, so the cursor is visible and clearable with no control of its own.

export const START_PREFIX = 'start:'

export function startToken(id: number): string {
  return `${START_PREFIX}${id}`
}

/** The query with its cursor replaced — one start point or none, never two. */
export function withStart(raw: string, id: number): string {
  return `${withoutStart(raw)} ${startToken(id)}`.trim()
}

/** The cursor a query carries, or null. Convenience over `splitQuery` for UI code. */
export function startOf(raw: string): number | null {
  return splitQuery(parseSearchQuery(raw)).start
}

export function withoutStart(raw: string): string {
  return raw
    .split(/\s+/)
    .filter((token) => !token.toLowerCase().startsWith(START_PREFIX))
    .join(' ')
    .trim()
}

/**
 * `start:` on a token, or null if it isn't one. An id that isn't a positive integer
 * gives null, and the caller leaves the token in the tag list — so `start:soon` returns
 * nothing rather than quietly browsing from the top, the same bargain `rating:nope` makes.
 */
function asStart(token: string): number | null {
  if (!token.startsWith(START_PREFIX)) return null
  const value = Number(token.slice(START_PREFIX.length))
  return Number.isInteger(value) && value > 0 ? value : null
}

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

export type SplitQuery = ParsedQuery & {
  ratings: Rating[]
  excludeRatings: Rating[]
  /** Where the listing starts, or null for "the newest post". */
  start: number | null
}

/**
 * Pulls the metatags out of a parsed query, leaving `include`/`exclude` holding tag
 * names only. An unknown value (`rating:nope`, `start:soon`) is left in place as a tag
 * name so the search honestly returns nothing rather than silently widening.
 *
 * Two `start:` tokens can only sensibly mean the older of them — a cursor is a floor,
 * and the lower floor is the one that holds. `-start:900` is meaningless, so it stays
 * an ordinary excluded tag and the search comes back empty, which is the honest answer
 * to a query nobody can satisfy.
 */
export function splitQuery(parsed: ParsedQuery): SplitQuery {
  const ratings: Rating[] = []
  const excludeRatings: Rating[] = []
  let start: number | null = null

  const keep = (list: string[], into: Rating[]) =>
    list.filter((token) => {
      const rating = asRating(token)
      if (rating) {
        if (!into.includes(rating)) into.push(rating)
        return false
      }
      return true
    })

  const includes = keep(parsed.include, ratings).filter((token) => {
    const id = asStart(token)
    if (id === null) return true
    start = start === null ? id : Math.min(start, id)
    return false
  })

  return {
    include: includes,
    exclude: keep(parsed.exclude, excludeRatings),
    ratings,
    excludeRatings,
    start,
  }
}

/**
 * The rating whitelist to hand the search, or `null` for "no filter".
 *
 * Two things narrow it, and they compose in one direction only. `visible` is the ceiling
 * the *caller* sets — the website hands it the safe tiers unless the NSFW cookie is
 * there; the desktop app passes nothing and gets everything. The query narrows within
 * that ceiling and can never lift it, so `rating:r18` typed by someone who hasn't
 * turned the adult tier on returns nothing rather than quietly reaching past the
 * setting. That is also why the intersection can come back empty: an empty whitelist is
 * a real answer, and `readPosts` filtering `rating in ()` matches no row, which is the
 * honest result.
 */
export function resolveRatings(
  { ratings, excludeRatings }: Pick<SplitQuery, 'ratings' | 'excludeRatings'>,
  visible: readonly Rating[] = RATINGS
): Rating[] | null {
  let allowed: Rating[] = ratings.length > 0 ? [...ratings] : [...visible]
  allowed = allowed.filter((r) => visible.includes(r))

  if (excludeRatings.length > 0) {
    allowed = allowed.filter((r) => !excludeRatings.includes(r))
  }

  return allowed.length === RATINGS.length ? null : allowed
}
