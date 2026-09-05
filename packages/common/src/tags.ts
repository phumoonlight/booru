/**
 * The five categories the app knows about — the ones with a colour, a label and a place
 * in the display order. They are not the only ones allowed: `tags.category` is free-form
 * text (see the migration's own comment), so a board can coin `series` or `medium` and
 * the code has to draw it rather than lose it. What this list buys is order and colour,
 * not permission.
 */
export const TAG_CATEGORIES = ['artist', 'copyright', 'character', 'general', 'meta'] as const

/** One of the five above. Use it only where the five are genuinely the whole domain. */
export type KnownCategory = (typeof TAG_CATEGORIES)[number]

/**
 * Any category a tag may carry. A plain lowercase word — see `CATEGORY_PATTERN` — and
 * deliberately not a union: narrowing it to the five made every read a lie about a
 * column that never enforced them, and a tag carrying anything else silently dropped out
 * of the grouped lists that only mapped over `TAG_CATEGORIES`.
 */
export type TagCategory = string

/**
 * Letters only, so a category can never be confused with a tag name (which allows
 * digits, `_`, `.`, `-` and parentheses) and never needs escaping in a URL or a class
 * name. Anything else is rejected rather than mangled.
 */
export const CATEGORY_PATTERN = /^[a-z]+$/

const KNOWN = new Set<string>(TAG_CATEGORIES)

function isKnownCategory(category: string): category is KnownCategory {
  return KNOWN.has(category)
}

/**
 * Display order for whatever the board actually holds: the five known categories in
 * their fixed order, then anything else A–Z. Callers pass every category in hand and
 * filter the empty groups afterwards — a list that mapped over `TAG_CATEGORIES` alone
 * would render a custom category's tags nowhere at all.
 */
export function categoryOrder(categories: Iterable<string>): TagCategory[] {
  const extra = [...new Set(categories)].filter((c) => !KNOWN.has(c)).sort()
  return [...TAG_CATEGORIES, ...extra]
}

export type Tag = {
  id: number
  name: string
  category: TagCategory
  post_count: number
}

export const TAG_PATTERN = /^[a-z0-9_().-]+$/

/**
 * Normalize free-text tag input (space/newline separated) into a clean,
 * deduped tag list. Returns invalid tokens separately for error messages.
 */
export function parseTagInput(input: string): {
  tags: string[]
  invalid: string[]
} {
  const tokens = input.toLowerCase().split(/\s+/).filter(Boolean)
  const tags: string[] = []
  const invalid: string[] = []
  for (const token of tokens) {
    if (!TAG_PATTERN.test(token)) {
      invalid.push(token)
    } else if (!tags.includes(token)) {
      tags.push(token)
    }
  }
  return { tags, invalid }
}

// Danbooru-style category colours, tuned for the dark theme. Here rather than beside the
// tag list they paint because the desktop uploader's tag field wants the same chips and
// imports no Next component (packages/desktop).
const KNOWN_COLOR: Record<KnownCategory, string> = {
  artist: 'text-[#ff8a8b]',
  copyright: 'text-[#c797ff]',
  character: 'text-[#35c64a]',
  general: 'text-[#4fa3e3]',
  meta: 'text-[#ead084]',
}

const KNOWN_LABEL: Record<KnownCategory, string> = {
  artist: 'Artist',
  copyright: 'Copyright',
  character: 'Character',
  general: 'General',
  meta: 'Meta',
}

/**
 * The colour a category is drawn in. Functions rather than the two records they wrap,
 * because a category is any word now and an unknown one still has to be legible — it
 * gets the plain foreground rather than a colour of its own, which is also the honest
 * signal that the app has no opinion about it.
 *
 * A Tailwind class here needs an `@source` line in the desktop's `styles.css`, the
 * fallback included — see the invariant in CLAUDE.md.
 */
export function categoryColor(category: TagCategory): string {
  return isKnownCategory(category) ? KNOWN_COLOR[category] : 'text-foreground'
}

/** What a person reads. An unknown category is shown capitalized, as typed. */
export function categoryLabel(category: TagCategory): string {
  return isKnownCategory(category)
    ? KNOWN_LABEL[category]
    : category.charAt(0).toUpperCase() + category.slice(1)
}
