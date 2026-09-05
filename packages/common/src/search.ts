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
export const POSTS_PATH = '/posts'

/**
 * Search URL for a query. That is the whole address now: where the listing starts
 * travels inside the query as a `start:` metatag, so there is no second param to keep
 * in step and nothing to forget to carry when a link is built.
 */
export function searchHref(query: string): string {
  const trimmed = query.trim()
  if (!trimmed) return POSTS_PATH
  const params = new URLSearchParams()
  params.set(SEARCH_PARAM, trimmed)
  return `${POSTS_PATH}?${params.toString()}`
}

// ── Rating metatags ────────────────────────────────────────────────────────────
// `rating:explicit` narrows the search to that rating; `-rating:explicit` drops it.
// They travel in the same `?query=` string as ordinary tags (Danbooru convention),
// so the search bar, chips and tag links need no special cases — only the data
// layer splits them back out.

/**
 * **A rating is stored as one letter and written as a word.** `posts.rating` holds
 * `g`, `s`, `q` or `e`; the chips and every link the app builds spell `rating:general`,
 * and `asRating` / `ratingToken` are the only two places the two forms meet. A query
 * typed by hand may use either — `asRating` reads both, `ratingToken` writes the name.
 *
 * The column is the reason. It is free-form text with no check constraint, repeated on
 * every row and every index entry, and the word carries nothing the letter doesn't —
 * `RATING_LABEL` is what a person actually reads, and it has never been the stored
 * value. The URL is the opposite case: `?query=rating:e` is a query nobody can read
 * back, and a saved query is a string somebody keeps.
 *
 * So `Rating` is the stored code everywhere in the code, and `RATING_NAME` is the one
 * translation, used only at the edge of a query string.
 */
export const RATINGS = ['g', 's', 'q', 'e'] as const

export type Rating = (typeof RATINGS)[number]

/** How a rating is written in a query. `rating:g` is read too, but never written. */
export const RATING_NAME: Record<Rating, string> = {
  g: 'general',
  s: 'sensitive',
  q: 'questionable',
  e: 'explicit',
}

/** The code a query name means, built from `RATING_NAME` so the two cannot drift. */
const RATING_BY_NAME: Record<string, Rating> = Object.fromEntries(
  RATINGS.map((rating) => [RATING_NAME[rating], rating])
)

/** Display form — what a person reads, on a facet or a post page. */
export const RATING_LABEL: Record<Rating, string> = {
  g: 'General',
  s: 'Sensitive',
  q: 'Questionable',
  e: 'Explicit',
}

// Danbooru's traffic-light convention, tuned for the dark theme
export const RATING_COLOR: Record<Rating, string> = {
  g: 'text-[#35c64a]',
  s: 'text-[#4fa3e3]',
  q: 'text-[#ead084]',
  e: 'text-[#ff5d5f]',
}

/**
 * The adult tiers. They stay out of the sitemap and out of search-engine results
 * (`robots: noindex`), and the website now also keeps them out of the listing until a
 * visitor turns them on in Settings — see `src/lib/nsfw.ts`. A post is still reachable
 * by its own URL either way: this is what the gallery volunteers, not access control,
 * and there are no accounts here to make it anything more.
 */
export const RESTRICTED_RATINGS: readonly Rating[] = ['q', 'e']

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
  // Both spellings are accepted: `rating:explicit` is what every link and chip the app
  // builds says, and `rating:e` is what someone typing into the box will reach for once
  // they have seen the column. Only the reading is loose — `ratingToken` still writes
  // the name, so the two forms never both end up in a URL the app produced.
  return RATING_BY_NAME[value] ?? ((RATINGS as readonly string[]).includes(value) ? (value as Rating) : null)
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
 * that ceiling and can never lift it, so `rating:explicit` typed by someone who hasn't
 * turned the adult tiers on returns nothing rather than quietly reaching past the
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
