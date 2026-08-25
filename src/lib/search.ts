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
