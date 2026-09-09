/**
 * How the /tags table spells its own address. Pure — the page renders it on the server
 * and the table's Show more link builds it in the browser, so nothing server-side may be
 * in this graph.
 *
 * Three params, all optional and all omitted at their default, so an unfiltered index is
 * plain `/tags`: `find` is the name filter, `category` narrows to one heading, and `show`
 * is how many rows are already open — which is what makes Show more a real link a crawler
 * and a browser without JS can follow, the same bargain the gallery's feed strikes.
 *
 * Deliberately *not* `searchHref`. That one spells the post listing's path and nothing
 * else may (invariant 9); this is a different listing of a different thing, and folding
 * them together would put `rating:` and `start:` grammar on a page with no posts on it.
 */

/** Rows per press of Show more, and the table's opening height. */
export const TAGS_PER_PAGE = 10

/**
 * The most `?show=` may ask for. Nothing here queries per row — the page slices a list it
 * already holds — so the cap is about the size of the HTML, not the cost of the read: a
 * hand-typed `?show=999999` should come back as a long page rather than the whole
 * vocabulary at once.
 */
export const TAGS_MAX_SHOWN = 500

export function tagsHref({
  find = '',
  category = '',
  show,
}: {
  find?: string
  category?: string
  show?: number
} = {}): string {
  const params = new URLSearchParams()
  if (find.trim()) params.set('find', find.trim())
  if (category) params.set('category', category)
  if (show !== undefined && show > TAGS_PER_PAGE) params.set('show', String(show))

  const query = params.toString()
  return query ? `/tags?${query}` : '/tags'
}

/** One search param as a string — the shape `searchParams` hands over. */
export function readParam(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** `?show=`, clamped. Anything unreadable is the opening height, never the cap. */
export function readShown(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(readParam(value), 10)
  if (!Number.isFinite(parsed)) return TAGS_PER_PAGE
  return Math.min(Math.max(parsed, TAGS_PER_PAGE), TAGS_MAX_SHOWN)
}
