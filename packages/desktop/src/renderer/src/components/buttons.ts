/**
 * How a button is drawn in this window, in one place, because it was being spelled out
 * a dozen ways.
 *
 * The shape is: an emoji, its words, and no box at all. No border, no ground at rest —
 * a control that is one glyph beside its own label is already legible as a control, and a
 * row of outlined boxes in a title row reads heavier than the heading above it. What
 * happens on hover is a **ground** and a lift in text colour, together: the ground is the
 * hit area appearing under the pointer, which is the thing a border was drawing all along
 * and only ever needed to draw while you were pointing at it.
 *
 * It replaced an underline on hover, which said "link" — and these are not links. They
 * run searches, unfold panels, delete tags. The one thing still underlined is text that
 * genuinely *is* a link: a URL or a post number sitting in a line of prose, in About, in
 * Settings and on a finished upload. Those go somewhere, and an underline is how a person
 * knows that before clicking.
 *
 * The hover ground has to be a step from whatever the button sits on, so there are two:
 * `hover:bg-surface` for a button on the page, `hover:bg-background` for one inside a
 * panel or a bordered row, which is already `bg-surface`. They are separate constants and
 * not two classes in one list, because two `hover:bg-*` utilities on one element are
 * resolved by the order they land in the stylesheet rather than the order they are
 * written.
 */

/**
 * Disabled is `muted`, not a dimmed version of whatever the button was. Both of the
 * things it replaced were unreadable: `text-border` is the hairline colour and vanished
 * into the ground, and `opacity-50` over `text-accent` left a blue too dark to read while
 * the emoji beside it stayed at full strength, so the control looked half broken rather
 * than unavailable. A `disabled:` variant carries a pseudo-class, so it outranks the
 * plain `text-*` in the same list without depending on stylesheet order.
 *
 * No opacity on the button itself — the colour change is the whole signal, and stacking a
 * fade on top of it is how the text got hard to read in the first place. The emoji is
 * dimmed separately, since a glyph has no text colour to change: the arbitrary variant
 * reaches the `aria-hidden` span every one of these buttons puts its emoji in, which is
 * cheaper than threading a `disabled` prop through a dozen call sites to add one class.
 */
const DISABLED =
  'disabled:text-muted disabled:hover:bg-transparent disabled:[&_[aria-hidden]]:opacity-40'

const SHAPE = `group flex shrink-0 items-center gap-1.5 rounded-lg transition-colors ${DISABLED}`

const QUIET = 'text-muted hover:text-foreground'

/** The default: a control on the page's own ground. */
export const BUTTON = `${SHAPE} ${QUIET} min-h-9 px-2 text-sm hover:bg-surface`

/** The same, smaller — a control that rides beside a line of text rather than leading a row. */
export const BUTTON_SM = `${SHAPE} ${QUIET} min-h-8 px-2 text-xs hover:bg-surface`

/** For a button inside a panel or a bordered row, which is already `bg-surface`. */
export const BUTTON_ON_SURFACE = `${SHAPE} ${QUIET} min-h-8 px-2 text-xs hover:bg-background`

/**
 * A button that opens something which stays open — New tag, Apply by tag, a layout. Accent
 * while it is showing, which is the whole of what an outline used to say.
 *
 * The colour is swapped into the shape rather than appended to `BUTTON`, for the same
 * reason the two grounds are separate: `text-muted` and `text-accent` in one class list is
 * a coin toss decided by stylesheet order.
 */
export const buttonToggle = (active: boolean): string =>
  `${SHAPE} min-h-9 px-2 text-sm hover:bg-surface ${active ? 'text-accent' : QUIET}`

/** The one that finishes a form — Search, Save, Create, Apply. Accent, and never a box. */
export const BUTTON_SUBMIT = `${SHAPE} min-h-9 px-3 text-sm text-accent hover:bg-surface`

/** The same, inside a panel. */
export const BUTTON_SUBMIT_ON_SURFACE = `${SHAPE} min-h-9 px-3 text-sm text-accent hover:bg-background`
