// Pure query-string helpers — shared by server components and the client search bar.
// URL is the state: /?tags=blue_hair+solo+-photo&page=2

export type ParsedQuery = {
  include: string[]
  exclude: string[]
}

/** Splits a raw `tags` string into include/exclude lists. `-tag` means exclude. */
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

/** Search URL for a query. Page 1 is left implicit so URLs stay clean. */
export function searchHref(query: string, page = 1): string {
  const params = new URLSearchParams()
  const trimmed = query.trim()
  if (trimmed) params.set('tags', trimmed)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `/?${qs}` : '/'
}

// ── Rating metatags ────────────────────────────────────────────────────────────
// `rating:e4` narrows the search to that rating; `-rating:e4` drops it.
// They travel in the same `?tags=` string as ordinary tags (Danbooru convention),
// so the search bar, chips and tag links need no special cases — only the data
// layer splits them back out.

export const RATINGS = ['general', 'e1', 'e2', 'e3', 'e4'] as const

export type Rating = (typeof RATINGS)[number]

/** Display form — the stored value is lowercase, the label is not. */
export const RATING_LABEL: Record<Rating, string> = {
  general: 'General',
  e1: 'E1',
  e2: 'E2',
  e3: 'E3',
  e4: 'E4',
}

/**
 * The adult tiers. Every visitor sees them on the site; this list only keeps them
 * out of the sitemap and out of search-engine results (`robots: noindex`).
 */
export const RESTRICTED_RATINGS: readonly Rating[] = ['e3', 'e4']

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
