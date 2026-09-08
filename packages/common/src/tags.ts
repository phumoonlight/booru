/**
 * The categories the app knows about — the ones with a colour, a label and a place in
 * the display order, and the only ones the desktop app will write.
 *
 * This list is the display order too, so it reads the way the Tags screen does: who made
 * it, then who is in it, then what they look like, then what they are doing, then the two
 * catch-alls. It is the board's own vocabulary rather than Danbooru's four — a booru's
 * categories are a statement about what it is for, and the code only ever needed a colour
 * per name.
 *
 * It has been re-cut four times, and it is shorter than it has ever been. The first cut
 * retired `head`, `exposure` and `posture` for `appearance`, `accessories` and `action`:
 * `head` and `body` were one division drawn in the wrong place — a hair colour and an eye
 * colour are both what someone looks like — and `exposure` was the sexual category under
 * another name. `posture` held only the standing-and-sitting half of what a subject is
 * doing, the rest being scattered through `general`.
 *
 * The second put `sexual` back, undoing a rename to `nsfw`: `nsfw` says how a board should
 * treat a tag, which the rating column already says per post, where `sexual` says what the
 * tag is *about*, which is what every other name here does. That cut also brought in a
 * `pov` category — where the camera is rather than what is in front of it — and took it
 * out again: every other name answers "what is in the picture", and one that answers "how
 * was it taken" is a second question the list was not sorting by. `general` holds those.
 *
 * The third brought `exposure` back for a narrower thing, the state a garment is in. The
 * fourth took it away again, and `body`, `clothes` and `accessories` with it — **four of
 * the twelve at once, and every one of them a question about the same subject answered in
 * a different box.** A dress is `clothes`, its being open is `exposure`, the bow on it is
 * `accessories` and the skin under it is `body`: the same picture was filed four times and
 * the boundary between the four had to be argued every time, which is a category list
 * doing the tagger's thinking badly rather than sparing it. They were also the half of the
 * vocabulary that grew without limit, and a category that keeps growing is the one a
 * picker cannot show. `general` takes all of it.
 *
 * That would have been a return to one flat list a year ago. It is not one now, because a
 * category is no longer the only thing that narrows a picker: the form groups on
 * `tag_rules` hide their members until the tag they hang off is on the post, so the
 * narrowing happens per post rather than per category, and the list here can be short
 * without the picker being long. Cutting the four is what that made affordable.
 *
 * The fourth cut also renamed `action` to `activity`. Same category and the same hue — a
 * rename, not a re-file — and the noun is the better one: `activity` reads as what a
 * subject is *doing*, where `action` reads as a single moment of it and invited a tag
 * about the shot rather than about the subject.
 *
 * **A retired name keeps working.** Nothing migrates: a tag still filed under `head`,
 * `clothes` or `action` is an unknown category, which `categoryOrder` sorts after the
 * known ones and `categoryColor` draws plain rather than dropping — so it stays on the
 * screen, stays searchable, and is visibly the odd one out until somebody moves it.
 * Losing the colour is the point; that is how you find them.
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
  'activity',
  'sexual',
  'general',
  'meta',
] as const

/** One of the above. Use it where the known set is genuinely the whole domain. */
export type KnownCategory = (typeof TAG_CATEGORIES)[number]

/**
 * How the desktop tag form cuts a category into rows — `tags.form_section`, whose
 * migration has the whole argument.
 *
 * **The website never sees these.** It draws the category, one heading, as it always has.
 * The form has a different job: a category answers "what is this tag", which is the right
 * question for a page listing a board's vocabulary and the wrong one for a row you are
 * trying to put your hand on. One Appearance row holding hair colours, hair styles,
 * garments and jewellery is a row you have to read; four rows under an Appearance heading
 * are four places to aim.
 *
 * It is also where the categories cut in the fourth re-cut went. `body`, `clothes`,
 * `accessories` and `exposure` were four boxes for one subject and they are one category
 * now — but the finer division was never wrong *for the form*, which is the only place it
 * was ever doing work. So the form still has it, and the board does not.
 *
 * **The list is whatever the tags carry**, not a constant in this file. It started as one
 * and it was the wrong shape for the thing: how a category wants dividing is a judgement
 * about one board's own vocabulary, made while looking at it, and a fixed list makes that
 * a code change and a new build — the same objection that keeps `tags.category` free-form
 * text. What a constant bought was an order and a row that could be drawn while empty; the
 * order is A–Z instead, and an empty section is not a thing that can exist, since a section
 * comes into being by being typed onto a tag on the Tags screen. Near-duplicate spellings
 * are what the datalist on that field is for.
 *
 * A category whose tags name no section is one row in the form, exactly as it always was.
 */

/**
 * A typed-in section as it is stored: trimmed, its inner runs of space collapsed, and
 * lowercased, with an empty one becoming null.
 *
 * Lowercased for the same reason tag names are — `Hair Color` and `hair color` are one
 * section typed twice, and two rows in the form under the same heading is exactly the
 * failure a free-text column has to be defended against. Unlike a tag name it may hold
 * spaces: it is a label a person reads, never a name anything searches for, so nothing
 * here has to match `TAG_PATTERN`.
 */
export function normalizeFormSection(raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, ' ').toLowerCase()
  return value === '' ? null : value
}

/**
 * The rows to draw under a category: the ones the board lists, in the order it lists them,
 * then anything the tags name that the board does not, A–Z.
 *
 * `listed` is `form_sections` for this category — authored, ordered, and drawn whether or
 * not anything is on it, since a row's ＋ is how the first tag gets onto it. `used` is the
 * sections the tags actually carry; null is not one of them, being the category's own row
 * above them, which is why it is dropped rather than sorted first.
 *
 * The second half is the same courtesy `categoryOrder` does a category outside
 * `TAG_CATEGORIES`, and for the same reason: a tag naming a section the table has never
 * heard of — because it was deleted, or typed before the table existed — is drawn at the end
 * rather than dropping out of the form. Reads never assume the list.
 */
export function orderFormSections(
  listed: readonly string[],
  used: Iterable<string | null | undefined>
): string[] {
  const known = new Set(listed)
  const extra = [...new Set([...used].filter((value): value is string => !!value))]
    .filter((value) => !known.has(value))
    .sort()
  return [...listed, ...extra]
}

/** What a person reads on a section row. Capitalized, as an unknown category is. */
export function formSectionLabel(section: string): string {
  return section.charAt(0).toUpperCase() + section.slice(1)
}

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
   * What is drawn in front of the name, or null — `tags.mark`, whose migration has why it
   * exists. Either a glyph or a colour, never both: `markColor` decides which by looking
   * at it, and `readTagMark` decides what may be written.
   *
   * Required rather than optional: every read asks for this column, because a tag is
   * drawn with its mark wherever it is drawn at all and a list that quietly dropped it
   * would look like a tag that has none.
   */
  mark: string | null
  /**
   * Which row of the desktop tag form this tag is offered on, or null for none —
   * `tags.form_section_id`, whose migration has why it is an id.
   *
   * The id is what is written; the name beside it is what everything above the data layer
   * groups and draws by, embedded by `listTags` rather than looked up per tag. The same
   * split as the tag rules: rows are ids so a rename carries them, and the screens are
   * written in names.
   *
   * Both optional, because most reads do not ask: only `listTags` selects them, the desktop
   * form and the desktop Tags screen being the only things that draw them, and a type
   * promising them everywhere would be a lie about the post page's own tag list.
   */
  form_section_id?: number | null
  form_section?: string | null
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
// lowercase words. Body is the exception and on purpose — a skin tone, because what it
// files is skin — so it is told from Head's orange by being far softer rather than by
// hue.
const KNOWN_COLOR: Record<KnownCategory, string> = {
  artist: 'text-[#ff8a8b]',
  copyright: 'text-[#c797ff]',
  character: 'text-[#35c64a]',
  // Kept its hex through every re-cut, so a board that has been re-filed looks like the
  // one you knew rather than a new palette to learn. The same goes for `activity` below,
  // which is `action` renamed and not a new category.
  appearance: 'text-[#ff9f43]',
  activity: 'text-[#b6d94c]',
  sexual: 'text-[#e8506e]',
  general: 'text-[#4fa3e3]',
  meta: 'text-[#ead084]',
}

const KNOWN_LABEL: Record<KnownCategory, string> = {
  artist: 'Artist',
  copyright: 'Copyright',
  character: 'Character',
  appearance: 'Appearance',
  activity: 'Activity',
  sexual: 'Sexual',
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
