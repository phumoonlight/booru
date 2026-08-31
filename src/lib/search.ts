// Pure query-string helpers — shared by server components and the client search bar.
// URL is the state: /posts?query=blue_hair+solo+-photo&from=900

/** The search param's name. Read it from here so the URL only spells it in one place. */
export const SEARCH_PARAM = 'query'

/**
 * The cursor param: which post the listing starts at, older ones below. It is what a
 * resumed bookmark spells in the URL, and it lives here with the other URL vocabulary
 * so the listing's address is described in exactly one file.
 */
export const FROM_PARAM = 'from'

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
 * Search URL for a query, optionally starting at a post rather than at the newest.
 *
 * There is no page number in here any more. The listing is a feed with a cursor, and
 * `from` says the one thing a page number used to: where to start. It is the better
 * half of that trade — a page number moves as posts are uploaded, an id does not.
 */
export function searchHref(query: string, from?: number): string {
  const params = new URLSearchParams()
  const trimmed = query.trim()
  if (trimmed) params.set(SEARCH_PARAM, trimmed)
  if (from !== undefined) params.set(FROM_PARAM, String(from))
  const qs = params.toString()
  return qs ? `${POSTS_PATH}?${qs}` : POSTS_PATH
}

// ── Rating metatags ────────────────────────────────────────────────────────────
// `rating:e4` narrows the search to that rating; `-rating:e4` drops it.
// They travel in the same `?query=` string as ordinary tags (Danbooru convention),
// so the search bar, chips and tag links need no special cases — only the data
// layer splits them back out.

export const RATINGS = ['general', 'e1', 'e2', 'e3', 'e4', 'e5'] as const

export type Rating = (typeof RATINGS)[number]

/** Display form — the stored value is lowercase, the label is not. */
export const RATING_LABEL: Record<Rating, string> = {
  general: 'General',
  e1: 'E1',
  e2: 'E2',
  e3: 'E3',
  e4: 'E4',
  e5: 'E5',
}

// Danbooru's traffic-light convention, tuned for the dark theme
export const RATING_COLOR: Record<Rating, string> = {
  general: 'text-[#35c64a]',
  e1: 'text-[#4fa3e3]',
  e2: 'text-[#ead084]',
  e3: 'text-[#ff8a8b]',
  e4: 'text-[#ff5d5f]',
  e5: 'text-[#ff2e31]',
}

/**
 * The adult tiers. Every visitor sees them on the site; this list only keeps them
 * out of the sitemap and out of search-engine results (`robots: noindex`).
 */
export const RESTRICTED_RATINGS: readonly Rating[] = ['e3', 'e4', 'e5']

export function isRestricted(rating: Rating): boolean {
  return RESTRICTED_RATINGS.includes(rating)
}

export const RATING_PREFIX = 'rating:'

export function ratingToken(rating: Rating): string {
  return `${RATING_PREFIX}${rating}`
}

function asRating(token: string): Rating | null {
  if (!token.startsWith(RATING_PREFIX)) return null
  const value = token.slice(RATING_PREFIX.length)
  return (RATINGS as readonly string[]).includes(value) ? (value as Rating) : null
}

export type SplitQuery = ParsedQuery & {
  ratings: Rating[]
  excludeRatings: Rating[]
}

/**
 * Pulls `rating:*` metatags out of a parsed query, leaving `include`/`exclude`
 * holding tag names only. An unknown value (`rating:nope`) is left in place as a
 * tag name so the search honestly returns nothing rather than silently widening.
 */
export function splitRatings(parsed: ParsedQuery): SplitQuery {
  const ratings: Rating[] = []
  const excludeRatings: Rating[] = []

  const keep = (list: string[], into: Rating[]) =>
    list.filter((token) => {
      const rating = asRating(token)
      if (!rating) return true
      if (!into.includes(rating)) into.push(rating)
      return false
    })

  return {
    include: keep(parsed.include, ratings),
    exclude: keep(parsed.exclude, excludeRatings),
    ratings,
    excludeRatings,
  }
}

/**
 * The rating whitelist to hand the search RPC, or `null` for "no filter".
 * Only the query narrows it: no rating is hidden from anyone by default.
 */
export function resolveRatings({
  ratings,
  excludeRatings,
}: Pick<SplitQuery, 'ratings' | 'excludeRatings'>): Rating[] | null {
  let allowed: Rating[] = ratings.length > 0 ? [...ratings] : [...RATINGS]

  if (excludeRatings.length > 0) {
    allowed = allowed.filter((r) => !excludeRatings.includes(r))
  }

  return allowed.length === RATINGS.length ? null : allowed
}
