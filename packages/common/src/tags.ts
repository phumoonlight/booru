/**
 * The categories the app knows about — the ones with a colour, a label and a place in
 * the display order, and the only ones the desktop app will write.
 *
 * This list is the display order too, so it reads the way the Tags screen does: who made
 * it, then who is in it, then the subject from the head down, then the two catch-alls.
 * The middle group is the board's own vocabulary rather than Danbooru's four — a booru's
 * categories are a statement about what it is for, and the code only ever needed a colour
 * per name.
 *
 * There was a `color` category. It went because a colour is never what a tag *is*:
 * `pink_dress` is a dress and `blonde_hair` is hair, and filing them by their adjective
 * put the same garment in two categories. Colour is a prefix now, recognised by
 * `COLOR_NAMES` and drawn as a dot, which is why nothing was lost by retiring it.
 *
 * It is still not a database constraint: `tags.category` is free-form text (see the
 * migration's own comment), so a row edited by hand can hold anything and the code draws
 * it rather than losing it. What this list buys is order, colour and what the app writes.
 */
export const TAG_CATEGORIES = [
  'artist',
  'copyright',
  'character',
  'head',
  'body',
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
  /**
   * A finer grouping inside the category, or null — `tags.category2`, whose migration has
   * why it exists. Optional rather than required because most reads do not ask for the
   * column: only `listTags` selects it, since the desktop app's tag picker is the only
   * thing that draws it, and a type that promised it everywhere would be a lie about the
   * post page's own tag list.
   */
  category2?: Subcategory
  /**
   * Up to three glyphs drawn in front of the name, or null — `tags.emoji`, whose
   * migration has why it exists. Required rather than optional, unlike `category2` above
   * it: every read asks for this column, because a tag is drawn with its emoji wherever
   * it is drawn at all and a list that quietly dropped it would look like a tag that has
   * none.
   */
  emoji: string | null
  post_count: number
}

/** A subgroup name, or nothing. Any string, the way `TagCategory` is any string. */
export type Subcategory = string | null

/**
 * A typed-in subgroup as it is stored: trimmed, its inner runs of space collapsed, and
 * lowercased, with an empty one becoming null.
 *
 * Lowercased for the same reason tag names are — `Dress Color` and `dress color` are one
 * subgroup typed twice, and two blocks in the picker with the same heading is exactly the
 * failure this column is meant to fix. Unlike a tag name it may hold spaces: it is a
 * heading a person reads, not a name anything searches for, so nothing here has to match
 * `TAG_PATTERN`.
 */
export function normalizeSubcategory(raw: string): Subcategory {
  const value = raw.trim().replace(/\s+/g, ' ').toLowerCase()
  return value === '' ? null : value
}

/** What a person reads above a subgroup's block. Capitalized, as with an unknown category. */
export function subcategoryLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * The subgroups present in a category, A–Z. The ungrouped tags are not one of these —
 * they are the block above them, which is why null is dropped rather than sorted first.
 */
export function subcategoryOrder(values: Iterable<Subcategory | undefined>): string[] {
  return [...new Set([...values].filter((value): value is string => !!value))].sort()
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
// lowercase words. Body is the exception and on purpose — a skin tone, because what it
// files is skin — so it is told from Head's orange by being far softer rather than by
// hue.
const KNOWN_COLOR: Record<KnownCategory, string> = {
  artist: 'text-[#ff8a8b]',
  copyright: 'text-[#c797ff]',
  character: 'text-[#35c64a]',
  head: 'text-[#ff9f43]',
  body: 'text-[#e3ad8a]',
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
  head: 'Head',
  body: 'Body',
  clothes: 'Clothes',
  exposure: 'Exposure',
  posture: 'Posture',
  sexual: 'Sexual',
  general: 'General',
  meta: 'Meta',
}

/**
 * Colour words, for splitting a tag like `white_underwear` into the colour and the thing.
 *
 * A list here rather than "whatever tags are in a Color category", which is what this
 * started as and could not work: recognising `pink_underwear` then needed a `pink` tag to
 * exist first, so a board that had never coined bare colours — most of them — got no
 * splitting at all, silently. The colours a language has are not a property of one board's
 * vocabulary, so they are not read from it, and this outlived the category itself.
 *
 * Longest match wins at the call site, which is why `light_blue` may sit beside `blue`.
 * Adding one is a line here; it costs nothing and nothing depends on the order.
 */
export const COLOR_NAMES: readonly string[] = [
  'aqua',
  'beige',
  'black',
  'blonde',
  'blue',
  'brown',
  'cyan',
  'dark_blue',
  'dark_brown',
  'dark_green',
  'dark_grey',
  'gold',
  'green',
  'grey',
  'gray',
  'light_blue',
  'light_brown',
  'light_green',
  'light_purple',
  'lavender',
  'magenta',
  'maroon',
  'navy',
  'olive',
  'orange',
  'pink',
  'purple',
  'red',
  'silver',
  'tan',
  'teal',
  'turquoise',
  'violet',
  'white',
  'yellow',
]

/**
 * A colour word as something a browser can paint, for the dot beside a colour variant.
 *
 * Most of `COLOR_NAMES` are CSS named colours once the underscore is dropped —
 * `light_blue` is `lightblue`, `dark_green` is `darkgreen` — so only the words CSS has no
 * name for are listed here. A word from neither list (a colour a board coined itself)
 * falls through as-is: `chartreuse` happens to be CSS too, and anything that is not simply
 * paints nothing, leaving the dot as an empty ring rather than a wrong colour.
 */
const SWATCH: Record<string, string> = {
  blonde: '#e8c87a',
  dark_brown: '#5b3a1e',
  light_brown: '#c08552',
  light_purple: '#c9a7ff',
}

export function colorSwatch(color: string): string {
  return SWATCH[color] ?? color.replace(/_/g, '')
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
