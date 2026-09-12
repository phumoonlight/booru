import { categoryColor } from '@common/tags'
import { tagLabel } from '@common/search'
import { TagMark } from './tag-mark'
import type { TagSeed } from './tag-seed'

/**
 * One card of the field: a heading, the tags on it, and — for a section — a ＋ and the
 * picker it opens.
 *
 * A row is a **form section** and there is no heading above it: the categories the form was
 * grouped under said what a tag *is*, which the website says and the Tags screen says, and
 * on a form with a picture in front of you the only question is where your hand goes. What
 * a category is still good for here is the chip's colour, which is read off the tag itself
 * — so one row can hold a General `bikini` beside an Appearance `bare shoulders` and both
 * are still recognisably what they are.
 *
 * The heading is a label and a count, and nothing to press: the card holds one row's worth
 * of chips and its ＋, both of which are already on screen. It folded for a revision — see
 * the note at the top of the file for why that was the wrong trade on a form whose job is
 * to keep the unanswered questions visible.
 *
 * The last row, `On no row`, is what the post carries that no section claims. It has no ＋:
 * it is not a row of the form at all, it is the form saying it is holding something it
 * cannot offer, and filing those tags is the Tags screen's job.
 */
export function SectionRow({
  label,
  tags,
  onRemove,
  markOf,
  disabled,
  adding = false,
  onAdd,
  picker,
}: {
  label: string
  /** The tags to draw here, already narrowed to this row by the caller. */
  tags: TagSeed[]
  /** Takes one off the post — the whole post, not just this row, which is the caller's. */
  onRemove: (name: string) => void
  markOf: (name: string) => string | null
  disabled: boolean
  /** Whether this row's picker is the one open. */
  adding?: boolean
  onAdd?: () => void
  picker?: React.ReactNode
}) {
  return (
    // A bordered card on `surface`, which is what puts its own edge around a row's worth of
    // form: rules between full-width rows said the same thing while the rows were the width
    // of the window, and say nothing at all once three of them sit side by side. Everything
    // inside is therefore drawn against `surface` — chips and picker on `background` — which
    // is the same step `BUTTON_ON_SURFACE` exists for.
    <div className="flex flex-col rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-1 pr-1">
        <span className="flex min-h-9 min-w-0 flex-1 items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <span className="min-w-0 truncate">{label}</span>
          {/* Only when it is holding something. A count of zero on every empty row is a
              column of noughts down a form that is mostly empty when you start. */}
          {tags.length > 0 && <span className="tabular-nums">({tags.length})</span>}
        </span>
        {/* On the heading rather than after the chips: a row's chips move as it is filled,
            and a target that moves is one you have to look for every time. */}
        {onAdd && (
          <button
            type="button"
            disabled={disabled}
            onClick={onAdd}
            aria-label={`Add a ${label} tag`}
            title={`Add a ${label} tag`}
            className={`flex min-h-7 shrink-0 items-center rounded-full border px-2 text-xs transition-colors ${
              adding
                ? 'border-accent text-accent'
                : 'border-border text-muted hover:border-accent hover:text-foreground'
            }`}
          >
            <span aria-hidden>➕</span>
          </button>
        )}
      </div>

      {tags.length > 0 && (
        // Against the card's own left edge, not indented under the label: a card is narrow
        // and an indent is width taken from the chips, which are what it is for.
        <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
          {tags.map((tag) => (
            <span
              key={tag.name}
              // A bordered pill, the way the tags offered in the picker are: the chosen
              // ones sat on a fill with no edge, so a row of them read as one band of
              // surface rather than as several tags. Rounded fully to keep the two apart
              // all the same — offered is square, chosen is a pill.
              //
              // Coloured by the tag's own category, not by the row's: a row is not a
              // category any more, and a chip that lost its colour would lose the one thing
              // on this screen that still says what the tag is.
              className={`flex items-center gap-1.5 rounded-full border border-border bg-background pl-2.5 font-mono text-xs ${categoryColor(tag.category)}`}
            >
              <TagMark mark={markOf(tag.name)} />
              {tagLabel(tag.name)}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemove(tag.name)}
                aria-label={`Remove ${tagLabel(tag.name)}`}
                className="flex min-h-7 items-center rounded-r-full pr-2.5 pl-1 text-muted hover:text-[#ff5d5f]"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Left open on purpose: tagging is done in runs — a post gets three colours or
          four pieces of clothing at once — and a picker that closed on each pick
          charged a click to reopen for every tag after the first. Close and Escape are
          the way out. */}
      {adding && picker}
    </div>
  )
}
