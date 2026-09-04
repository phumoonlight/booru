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
  return `${RATING_PREFIX}${rating}`
}

/**
 * `rating:` on a token, or null if it isn't one. Exported because the desktop uploader's
 * implication rules spell an implied rating with the same token in the same list as the
 * implied tags — one grammar for "a rating written among tags", not two.
 */
export function asRating(token: string): Rating | null {
  if (!token.startsWith(RATING_PREFIX)) return null
  const value = token.slice(RATING_PREFIX.length)
  return (RATINGS as readonly string[]).includes(value) ? (value as Rating) : null
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
