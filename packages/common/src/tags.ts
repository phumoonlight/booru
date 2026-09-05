/**
 * The categories the app knows about — the ones with a colour, a label and a place in
 * the display order, and the only ones the desktop app will write.
 *
 * This list is the display order too, so it reads the way the Tags screen does: who made
 * it, then who is in it, then what is in the picture, then the two catch-alls. The middle
 * group is the board's own vocabulary rather than Danbooru's four — a booru's categories
 * are a statement about what it is for, and the code only ever needed a colour per name.
 *
 * It is still not a database constraint: `tags.category` is free-form text (see the
 * migration's own comment), so a row edited by hand can hold anything and the code draws
 * it rather than losing it. What this list buys is order, colour and what the app writes.
 */
export const TAG_CATEGORIES = [
  'artist',
  'copyright',
  'character',
  'color',
  'clothes',
  'exposure',
  'posture',
  'sexual',
  'general',
  'meta',
] as const

/** One of the above. Use it where the known set is genuinely the whole domain. */
export type KnownCategory = (typeof TAG_CATEGORIES)[number]

/**
 * Any category a tag may carry, which is any string: the column is free-form text and
 * deliberately not a union here, because narrowing a *read* to the known list made it a
 * lie about a column that never enforced one — a tag carrying anything else silently
 * dropped out of every grouped list that mapped over `TAG_CATEGORIES`. Writes are the
 * other way round: `z.enum(TAG_CATEGORIES)` on the two IPC channels that set it.
 */
export type TagCategory = string

const KNOWN = new Set<string>(TAG_CATEGORIES)

function isKnownCategory(category: string): category is KnownCategory {
  return KNOWN.has(category)
}

/**
 * Display order for whatever the board actually holds: the known categories in their
 * fixed order, then anything else A–Z. Callers pass every category in hand and filter the
 * empty groups afterwards — a list that mapped over `TAG_CATEGORIES` alone would render a
 * hand-edited or renamed-away category's tags nowhere at all.
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
// One hue each, spread around the wheel rather than shaded off one another: the whole
// point is telling two rows apart at a glance in a list that is otherwise one column of
// lowercase words.
const KNOWN_COLOR: Record<KnownCategory, string> = {
  artist: 'text-[#ff8a8b]',
  copyright: 'text-[#c797ff]',
  character: 'text-[#35c64a]',
  color: 'text-[#ff9f43]',
  clothes: 'text-[#45c8c0]',
  exposure: 'text-[#ff87c8]',
  posture: 'text-[#b6d94c]',
  sexual: 'text-[#e8506e]',
  general: 'text-[#4fa3e3]',
  meta: 'text-[#ead084]',
}

const KNOWN_LABEL: Record<KnownCategory, string> = {
  artist: 'Artist',
  copyright: 'Copyright',
  character: 'Character',
  color: 'Color',
  clothes: 'Clothes',
  exposure: 'Exposure',
  posture: 'Posture',
  sexual: 'Sexual',
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
