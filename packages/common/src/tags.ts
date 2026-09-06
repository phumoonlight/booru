/**
 * The categories the app knows about — the ones with a colour, a label and a place in
 * the display order, and the only ones the desktop app will write.
 *
 * This list is the display order too, so it reads the way the Tags screen does: who made
 * it, then who is in it, then what they look like, then what they are wearing and
 * carrying, then what they are doing, then the two catch-alls. The middle group is the board's own vocabulary
 * rather than Danbooru's four — a booru's categories are a statement about what it is for,
 * and the code only ever needed a colour per name.
 *
 * It has been re-cut once already: `head`, `exposure` and `posture` went, `sexual` became
 * `nsfw`, and `appearance`, `accessories` and `action` arrived. `head` and `body` were one division
 * drawn in the wrong place — a hair colour and an eye colour are both what someone looks
 * like — and `exposure` was `nsfw` under another name. `posture` only ever held half of
 * what a subject is doing, the standing-and-sitting half, with the rest scattered through
 * `general`.
 *
 * **A retired name keeps working.** Nothing migrates: a tag still filed under `head` is
 * an unknown category, which `categoryOrder` sorts after the known ones and
 * `categoryColor` draws plain rather than dropping — so it stays on the screen, stays
 * searchable, and is visibly the odd one out until somebody moves it. Losing the colour
 * is the point; that is how you find them.
 *
 * There was a `color` category. It went because a colour is never what a tag *is*:
 * `pink_dress` is a dress and `blonde_hair` is hair, and filing them by their adjective
 * put the same garment in two categories. A colour is a *mark* now — `tags.mark`, set per
 * tag and drawn as a dot — which is why nothing was lost by retiring it.
 *
 * It is still not a database constraint: `tags.category` is free-form text (see the
 * migration's own comment), so a row edited by hand can hold anything and the code draws
 * it rather than losing it. What this list buys is order, colour and what the app writes.
 */
export const TAG_CATEGORIES = [
  'artist',
  'copyright',
  'character',
  'appearance',
  'body',
  'clothes',
  'accessories',
  'action',
  'nsfw',
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
   * What is drawn in front of the name, or null — `tags.mark`, whose migration has why it
   * exists. Either a glyph or a colour, never both: `markColor` decides which by looking
   * at it, and `readTagMark` decides what may be written.
   *
   * Required rather than optional, unlike `category2` above it: every read asks for this
   * column, because a tag is drawn with its mark wherever it is drawn at all and a list
   * that quietly dropped it would look like a tag that has none.
   */
  mark: string | null
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
  // The three that replaced a category keep its hex, so a board that has been re-filed
  // looks like the one you knew rather than a new palette to learn.
  appearance: 'text-[#ff9f43]',
  body: 'text-[#e3ad8a]',
  clothes: 'text-[#45c8c0]',
  // `exposure`'s pink, freed when that category went and reused rather than retired: the
  // palette is ten hand-picked hues that stay apart on a dark ground, and inventing an
  // eleventh is how two categories end up looking alike.
  accessories: 'text-[#ff87c8]',
  action: 'text-[#b6d94c]',
  nsfw: 'text-[#e8506e]',
  general: 'text-[#4fa3e3]',
  meta: 'text-[#ead084]',
}

const KNOWN_LABEL: Record<KnownCategory, string> = {
  artist: 'Artist',
  copyright: 'Copyright',
  character: 'Character',
  appearance: 'Appearance',
  body: 'Body',
  clothes: 'Clothes',
  accessories: 'Accessories',
  action: 'Action',
  // Spelled the way it is everywhere else on a board, in caps — "Nsfw" from the generic
  // capitalizer would read as a word rather than the label it is.
  nsfw: 'NSFW',
  general: 'General',
  meta: 'Meta',
}

/**
 * The 148 colours CSS knows by name, so `blue` in a tag's mark paints and `bow` does not.
 *
 * A list is the only way to tell one from the other without a browser to ask: `@common`
 * compiles in Electron's main process and in a server render, neither of which has
 * `CSS.supports`. The whole list rather than a useful subset, because "a plain CSS colour"
 * is the promise the field makes, and a subset makes that promise a guessing game about
 * which names somebody thought to include.
 *
 * It replaced `COLOR_NAMES`, a list of colour *words* used to guess a dot off the front of
 * a tag's name — `blue_hair` painted blue. That guess read `golden_retriever` as gold, had
 * nothing to say about a colour it had never heard of, and could not be corrected on the
 * one tag it got wrong. A mark is typed now, so the list only has to answer "is this
 * word a colour", which is a question about CSS and not about anyone's vocabulary.
 */
const CSS_COLOR_NAMES = new Set([
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black',
  'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
  'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue',
  'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki',
  'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon',
  'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise',
  'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue',
  'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold',
  'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink',
  'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen',
  'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow',
  'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen',
  'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow',
  'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue',
  'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue',
  'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream',
  'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab',
  'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise',
  'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue',
  'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon',
  'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue',
  'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle',
  'tomato', 'transparent', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke',
  'yellow', 'yellowgreen',
])

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` — the hex forms a browser accepts. */
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/

/**
 * A mark read as a colour a browser can paint, or null if it is meant to be drawn as text.
 *
 * This is the whole of how one column holds two kinds of thing: `#7fc8ff` and `blue` come
 * back as themselves and get a dot, `🎀` comes back null and gets drawn. Nothing is
 * ambiguous in practice — an emoji is never a hex string and never a CSS colour name —
 * and the one collision that exists is decided in the colour's favour on purpose: a mark
 * of `red` is a red dot, because a person who wanted the word would have typed something
 * that is not also a colour.
 *
 * Case-insensitive, since `#7FC8FF` off a colour picker is the same colour as `#7fc8ff`.
 */
export function markColor(mark: string | null | undefined): string | null {
  if (!mark) return null
  const value = mark.trim().toLowerCase()
  return HEX.test(value) || CSS_COLOR_NAMES.has(value) ? value : null
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
