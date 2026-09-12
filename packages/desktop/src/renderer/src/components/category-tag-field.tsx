import { useEffect, useMemo, useRef, useState } from 'react'
import { categoryColor, formSectionLabel, isSpacer, markColor, type Tag } from '@common/tags'
import { tagLabel } from '@common/search'
import { impliedTags, type ImplicationRules } from '../../../shared/implications'
import { recommendedTags } from '../../../shared/recommendations'
import { useFormSections } from '../form-sections'
import type { FormSection } from '@common/data/form-sections'
import { useImplications } from '../implications'
import { useRecommendations } from '../recommendations'
import type { TagSeed } from './tag-seed'

/**
 * A post's tags, in the rows the board's form sections make, with a picker per row.
 *
 * The one tag editor both screens use: staging a post and editing one differ in when the
 * write happens, not in what a tag is. It replaced a single free-text box whose one job
 * it could not do — a name typed there had no category until the board was asked, so a
 * new tag was coined as General whatever it actually was, and `blue_hair` ended up on the
 * board twice in two categories. Choosing from the Hair color row cannot be wrong.
 *
 * **A row is a form section, and nothing above it is a category.** For one revision the
 * form was categories with their sections indented underneath, which asked the question
 * twice: a category says what a tag *is*, which is the website's question and the Tags
 * screen's, and a row says where your hand goes, which is the only question being asked
 * with a picture in front of you. The nesting also kept a row from holding what a category
 * cannot — `bikini` is General, `bare shoulders` is Appearance, and both belong on the row
 * you fill in looking at a swimsuit. The category is still on every chip, as its colour.
 *
 * **Nothing folds.** Each row was collapsible for a revision, on the theory that a dozen
 * sections is longer than a screen — but a card is only as tall as what is on it, three sit
 * across the window, and most rows on most posts are empty, so the fold was saving nothing
 * and charging a click. Worse, a shut row is a row you cannot see is empty: what this form
 * is *for* is being reminded of the questions you have not answered about the picture, and
 * a control whose whole effect is to hide unanswered questions is working against it.
 */

/**
 * The board's names and categories, held once for every field on screen. A staged queue
 * of twenty cards is twenty of these components, and each asking the bridge for the same
 * few hundred kilobytes would be twenty identical round trips.
 *
 * Deliberately not the Tags screen's cache (`tag-index.tsx`). That one carries
 * `post_count` and has to be dropped whenever a post is saved, because saving moves
 * counts. This one holds names and categories, which no post write can change — only
 * creating, renaming or deleting a tag can, and coining one from the picker is the only
 * one of those that can happen from here.
 */
let index: Tag[] | null = null

/**
 * How many tags a row needs before its picker offers a search box. Below it the whole row
 * is on screen already and a field would be one more thing between you and the chips.
 */
const SEARCH_FROM = 10

/**
 * Whether a section's condition is met by the tags on the post.
 *
 * A section with no dependencies has no condition and is always drawn, which is most of
 * them — `hair color` is not about any one series. One with dependencies waits: `any` needs
 * one of them on the post, `all` needs every one.
 *
 * This replaced two things at once. A **form group** (`tag_rules` kind 2) hid tags *inside*
 * a picker, so the row was still drawn with a ＋ that opened onto nothing and could not say
 * why. And Character used to match its sections against the post's copyright tags by name —
 * `blue_archive` opening `blue archive` — which was exactly one dependency, in `any` mode,
 * hardcoded for one pair of categories. Both are this now, written on the row they govern
 * and visible on the Sections panel.
 */
function dependenciesMet(section: FormSection, have: Set<string>): boolean {
  if (section.deps.length === 0) return true
  return section.depsMode === 'all'
    ? section.deps.every((name) => have.has(name))
    : section.deps.some((name) => have.has(name))
}
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function loadIndex(): Promise<void> {
  if (inflight) return inflight
  // No board. This copy holds names, categories, marks and sections and no count, and
  // those are one vocabulary across both boards — which is the whole reason the two share
  // a `tags` table. Only the Tags grid's copy is per board, because that one draws and
  // sorts by `post_count`.
  inflight = window.api
    .listTags()
    .catch(() => [] as Tag[])
    .then((tags) => {
      index = tags
      inflight = null
      for (const listener of listeners) listener()
    })
  return inflight
}

/**
 * Drops the shared copy and reads again. Called from the Tags screen, which is the only
 * place a tag can now be created, renamed or deleted — nothing on the tagging screens can
 * change this list any more, and a post save cannot: it moves `post_count`, which this
 * cache does not carry.
 */
export function invalidateTagNames(): void {
  index = null
  void loadIndex()
}

/**
 * The board's tags as names, categories, marks and sections — no counts, and so one list
 * whichever board the window is on. Exported because the tag rule editor searches the same
 * vocabulary: a rule may only name a tag the board has, which is this list exactly.
 */
export function useTagIndex(): Tag[] | null {
  const [, bump] = useState(0)

  useEffect(() => {
    const listener = () => bump((n) => n + 1)
    listeners.add(listener)
    if (index === null) void loadIndex()
    return () => {
      listeners.delete(listener)
    }
  }, [])

  return index
}

/**
 * The tags as the upload pipeline reads them: one space-separated string.
 *
 * With `rules`, what they imply is appended. The implied tags are shown beside the field
 * and never inside it — the rows are the record of what was chosen by hand — so this is
 * the one place the two lists join, exactly as `tagsToInput` was for the free-text field.
 */
export function seedsToInput(tags: TagSeed[], rules?: ImplicationRules): string {
  const chosen = tags.map((tag) => tag.name)
  return [...chosen, ...(rules ? impliedTags(chosen, rules) : [])].join(' ')
}

export function CategoryTagField({
  value,
  onChange,
  label = 'Tags',
  actions,
  disabled = false,
  imply = false,
  recommend = false,
}: {
  value: TagSeed[]
  onChange: (next: TagSeed[]) => void
  label?: string
  /**
   * What the caller puts on the heading row, beside the label. It is the one line on this
   * field that is not a category, so it is where the controls that are about the whole
   * field belong — anything given `ml-auto` sits at the right end of it.
   */
  actions?: React.ReactNode
  disabled?: boolean
  /**
   * Show what the implication rules add. On for the queue, where `seedsToInput` appends
   * them at upload; off for the post editor, where every control writes on the spot and a
   * line of tags that are *not* being written would be the one lie on the screen.
   */
  imply?: boolean
  /** Offer what usually goes with these. Nothing happens until a chip is pressed. */
  recommend?: boolean
}) {
  // Which row's picker is open, by section id, or null. A row is a section and nothing
  // else now, so one number says which — where a category and a section together used to
  // be needed to tell Appearance's own row from every row under it.
  const [adding, setAdding] = useState<number | null>(null)
  const all = useTagIndex()
  const rules = useImplications()
  const recommendations = useRecommendations()
  const sections = useFormSections()

  const names = value.map((tag) => tag.name)

  // Derived every render, never state: the rules are the truth about what follows from
  // what is on the post, so there is nothing here to fall out of step with the rows.
  const implied = imply ? impliedTags(names, rules) : []
  const offered = recommend ? recommendedTags(names, recommendations, [...names, ...implied]) : []

  /** A recommended name is a chip, not a row, so its category has to be looked up. */
  const categoryOf = (name: string): string =>
    (all ?? []).find((tag) => tag.name === name)?.category ?? 'general'

  /**
   * The same for the mark. A chosen tag is a name and a category — `TagSeed` — so what is
   * drawn in front of it comes from the board's index rather than from the chip, and a tag
   * that has not loaded yet, or was coined a moment ago, simply has none until it does.
   */
  const markOf = (name: string): string | null =>
    (all ?? []).find((tag) => tag.name === name)?.mark ?? null

  /**
   * Which row a chosen tag belongs on, or null for none. Read off the board's index, like
   * the mark, since a `TagSeed` is a name and a category.
   *
   * The **id**, not the name it used to be. A tag points at a live row or at nothing —
   * deleting a section sets the column null — so there is no longer such a thing as a tag
   * filed on a row the list has never heard of, and the block that drew those at the end
   * went with it.
   */
  const slotOf = (name: string): number | null =>
    (all ?? []).find((tag) => tag.name === name)?.form_section_id ?? null

  const add = (tag: TagSeed) => {
    if (value.some((t) => t.name === tag.name)) return
    onChange([...value, tag])
  }

  /** Takes one off the post. A row draws a slice of `value`, so removing is the whole
   *  list's business and not the row's. */
  const remove = (name: string) => onChange(value.filter((tag) => tag.name !== name))

  /**
   * What a section's dependencies are tested against: everything the post carries, implied
   * tags included. A rule that put `blue_archive` on is as good a reason to open its row as
   * typing it was — the person tagging cannot tell which of the two happened without
   * reading the implied line, and should not have to.
   */
  const satisfied = new Set([...names, ...implied])

  // The rows the post already has something on, so a section whose condition is not met is
  // still drawn while it is holding a tag. A row that vanishes takes a tag you can no
  // longer see or remove, and the post editor would save it straight back.
  const onPost = new Set(value.map((tag) => slotOf(tag.name)))

  // The board's rows, in the order it put them in — the empty ones included, since a row's
  // ＋ is how the first tag gets onto it. A section is drawn when its **dependencies are
  // met**: none, and it is always there; some, and it waits for them. `hair color` is
  // always drawn, `blue archive` when `blue_archive` is on the post.
  const shown = sections.filter(
    (section) => dependenciesMet(section, satisfied) || onPost.has(section.id)
  )

  /**
   * The two columns, as the board says: a row carries the side it is on (`side` on
   * `tag_form_sections`), and this only draws it.
   *
   * That is the whole reason it is stored. A row appears and disappears as the post changes
   * — that is what a section's dependencies are — and in a grid that flows, one row arriving
   * shunts every row after it one place along, so half the form swaps sides while you are
   * reaching for it. Deriving the side from the parity of a flat position fixed that and
   * bought a different bug, since a flat list cannot say that one column holds one more than
   * the other. Read off the row, a section is where it was put, and the arrangement is the
   * one laid out by hand on the 🧱 Sections screen.
   *
   * The columns go uneven when several conditional rows on one side are hidden at once,
   * which is what a form whose rows come and go looks like and not something to even up.
   */
  const columns: [FormSection[], FormSection[]] = [
    shown.filter((section) => section.side !== 1),
    shown.filter((section) => section.side === 1),
  ]

  // **A tag on no row is not offered**, and is still drawn when the post carries one. Not
  // being offered is a statement about the picker; a chip that is on the post and drawn
  // nowhere would be a tag you cannot see and cannot take off, which the post editor would
  // then save straight back. Filing it is the Tags screen's job — an unfiled tag is one the
  // vocabulary has not decided about yet.
  const unfiled = value.filter((tag) => slotOf(tag.name) === null)

  return (
    <section className={`flex flex-col gap-1 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex min-h-7 items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</h2>
        {actions}
      </div>

      {/*
        A card each, two across. As full-width rows a section was a line of text with a ＋ a
        screen away at the other end, and a form of a dozen of them was a dozen screens of
        mostly empty line — the chips that make a row worth reading occupy a fraction of the
        width they were given. A card is as wide as its contents need and the ＋ is always
        beside its own label.

        Two, not three: a tag is a chip of a whole word and often two, and at a third of the
        window a row of four hair colours wrapped onto three lines — which costs more height
        than the third column saved and makes a row harder to read than the full-width one
        it replaced. A column count is chosen against the width of the chips, not against the
        width of the window.

        **Two real columns, not a flowing grid**, and which side a row is on is the board's
        answer rather than whatever fits. Two columns at every width, so the sides are the
        same sides on a narrow window — stacking them into one would read down the left half
        and then down the right, which is not the order the form is in.
      */}
      <div className="relative grid grid-cols-2 items-start gap-x-4">
        {/* The line between the sides. A gap alone stopped saying "two columns" the moment
            one side ran longer than the other — a card with nothing beside it reads as a
            full-width row that happens to be short. Absolutely positioned rather than a
            border on either column, so it is one rule down the middle of the whole block
            however uneven the two sides are, and out of the flow so it takes no cell. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border"
        />
        {columns.map((column, side) => (
          <div key={side} className="flex flex-col gap-2">
            {column.map((section) =>
              // A spacer holds nothing and is drawn as nothing: a gap of about a card's
              // heading, which is the unit the columns go out of step by. It is here rather
              // than filtered out one level up because where the gap falls in the column is
              // the whole of what it does.
              isSpacer(section.name) ? (
                <div key={section.id} aria-hidden className="h-4" />
              ) : (
                <SectionRow
                  key={section.id}
                  label={formSectionLabel(section.name)}
                  tags={value.filter((tag) => slotOf(tag.name) === section.id)}
                  onRemove={remove}
                  markOf={markOf}
                  disabled={disabled}
                  adding={adding === section.id}
                  onAdd={() => setAdding((current) => (current === section.id ? null : section.id))}
                  picker={
                    <TagPicker
                      section={section.id}
                      all={all}
                      exclude={names}
                      onPick={add}
                      onClose={() => setAdding(null)}
                    />
                  }
                />
              )
            )}
          </div>
        ))}
      </div>

      {/* Full width and under both columns, because it is not a row of the form: it is what
          the post carries that no row can offer, and putting it in a column would make it
          look like one more section to fill in. */}
      {unfiled.length > 0 && (
        <div className="pt-2">
          <SectionRow
            label="On no row"
            tags={unfiled}
            onRemove={remove}
            markOf={markOf}
            disabled={disabled}
          />
        </div>
      )}

      {/* A board with no rows at all can offer nothing — which is a blank form and looks
          like a broken one. Said once, in a line that names where a row is made.

          Tested on the *sections*, not on whether any tag carries one: a row named and not
          yet filled is exactly the state this notice must not appear in, and it is the
          ordinary first step now that a section is made before anything goes on it. */}
      {all !== null && sections.length === 0 && (
        <p className="py-2 text-xs text-muted">
          No form rows yet — make one with 🧱 Sections on the Tags screen, then put tags on it.
        </p>
      )}

      {/*
        What the rules add, outside the rows on purpose: among them, a tag nobody chose
        looked exactly like one that was chosen, and the rows are the record of what you
        did by hand. Read-only for the same reason — these follow from the tags above and
        from the Implications screen, so the way to change one is to change the tag or the
        rule. `seedsToInput` is where the two lists join.
      */}
      {implied.length > 0 && (
        <div className="flex items-baseline gap-1 pt-1">
          {/* Accent, where every row label is grey: these two lines are the only ones on
              the field that something other than you put there, and a rule that goes
              unnoticed is a rule you stop trusting. */}
          <span className="w-50 shrink-0 text-xs font-semibold uppercase tracking-wide text-accent">
            Implied
          </span>
          <div className="flex flex-1 flex-wrap items-baseline gap-1">
            {implied.map((name) => (
              <span
                key={name}
                title="Added by a rule on the Tag rules screen"
                className="rounded bg-background px-2 py-0.5 font-mono text-xs text-muted"
              >
                {tagLabel(name)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/*
        What usually goes with what is already on the post — a press each, and nothing
        happens to the ones you don't press. The line above is what the rules did; this one
        is what they are asking about, which is why these are buttons and those are not.
      */}
      {offered.length > 0 && (
        <div className="flex items-baseline gap-1 pt-1">
          <span className="w-50 shrink-0 text-xs font-semibold uppercase tracking-wide text-accent">
            Recommended
          </span>
          <div className="flex flex-1 flex-wrap items-baseline gap-1">
            {offered.map((name) => (
              <button
                key={name}
                type="button"
                disabled={disabled}
                onClick={() => add({ name, category: categoryOf(name) })}
                title="Recommended by a rule on the Tag rules screen"
                className="rounded border border-border px-2 py-0.5 font-mono text-xs text-muted transition-colors hover:border-accent hover:text-foreground disabled:opacity-50"
              >
                + {tagLabel(name)}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

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
function SectionRow({
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

/**
 * One row's tags, to pick from.
 *
 * It reads the index in memory rather than querying — that index is `main/tag-cache.ts`, a
 * day-old copy of every name on the board, which is what makes narrowing a row to a
 * substring a local operation instead of a request per letter. Counts are not drawn: they
 * order the list, most used first, and that ordering is the answer to what a number beside
 * each name was being read for.
 *
 * **It only offers what the board already has.** Coining a tag from here is gone: a tag
 * created while tagging is created in a hurry, by someone looking at a picture rather than
 * at the vocabulary, which is how a board ends up with `twintail`, `twintails` and
 * `twin_tails`. Naming one is the Tags screen's job, where the whole list is in front of
 * you and a near-duplicate is visible before you make it.
 *
 * **One row's tags, and no filtering beyond that.** It used to test the category as well,
 * which was one filter too many the moment a row stopped being a division of one: a section
 * holds whatever has been filed onto it, and a `bikini` filed there is on the row whatever
 * category it is in. The narrowing that used to happen inside a picker happens a level up —
 * a section is drawn or not drawn by its own dependencies, so by the time this is open the
 * question "which of these could apply" has been answered by the row appearing at all.
 *
 * Two mechanisms lived here and both went. `tags.category2` was a subgroup name typed onto
 * each tag: it divided a category into fixed blocks and could not shorten one, since every
 * block was drawn whatever the post was about. **Form groups** (`tag_rules` kind 2) then
 * hid tags *inside* this list until the tag they hung off was on the post — the right
 * question, still asked in the wrong place, because the row stayed drawn with a ＋ that
 * opened onto nothing and could not say why. Before either, the split was *guessed* from
 * the name: a tag starting with a colour word went below a rule, which worked for
 * `blue_dress` and for nothing else. What a row holds is a judgement about the vocabulary,
 * so it is stored beside the vocabulary rather than re-derived here — as is the mark in
 * front of a name, which used to be half guessed from the name itself. See `TagMark`.
 */

/**
 * What a tag carries in front of its name — one mark, from the tag's own row.
 *
 * A colour is a dot, anything else is drawn as text; `markColor` is the whole of that
 * decision and it is shared with the website, so a tag looks the same in both windows.
 *
 * There used to be a second, unrelated mark here: a colour dot guessed from the *name*,
 * painted on any tag beginning with a word from a list in code. It read `gold_trim` as
 * gold and `golden_retriever` as gold too, said nothing about a colour the list had never
 * heard of, and could not be corrected on the one tag it got wrong. A guess that cannot be
 * overridden is worse than no guess, so the dot is asked for now — typed into the same box
 * the emoji goes in, which is why they are one column and why only one of them can win.
 *
 * Drawn on the chips a post already carries as well as the ones offered, so a tag looks
 * the same before and after it is picked.
 */
export function TagMark({ mark }: { mark: string | null }) {
  if (!mark) return null

  const color = markColor(mark)
  if (!color) {
    return (
      <span aria-hidden className="leading-none">
        {mark}
      </span>
    )
  }

  return (
    <span
      aria-hidden
      // The border keeps white and black from disappearing into the two grounds they
      // would otherwise match.
      style={{ background: color }}
      className="size-3 shrink-0 rounded-full border border-border"
    />
  )
}

function TagPicker({
  section,
  all,
  exclude,
  onPick,
  onClose,
}: {
  /** The row this was opened from, by id. A picker offers one row's tags and no others:
   *  the ＋ you pressed is the promise about where what you pick will land. */
  section: number
  all: Tag[] | null
  exclude: string[]
  onPick: (tag: TagSeed) => void
  onClose: () => void
}) {
  const [filter, setFilter] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Matched against the stored name, so a space typed where the chips show one is an
  // underscore here. Filtering on what is drawn rather than on what is stored would be the
  // same thing said twice; this way the box takes either spelling.
  const typed = filter.trim().toLowerCase().replace(/ /g, '_')

  /** Everything this row could offer, before anything is typed. */
  const available = useMemo(() => {
    const taken = new Set(exclude)
    return (all ?? []).filter(
      (tag) =>
        !taken.has(tag.name) &&
        // The row's own tags, and no others: the ＋ you pressed is a promise about where
        // what you pick will land. That is the whole of the filtering — what a row *is* is
        // decided by the section's own dependencies, one level up, where the row either
        // appears or does not.
        (tag.form_section_id ?? null) === section
    )
  }, [all, section, exclude])

  /**
   * The box appears only once a row is long enough to be worth narrowing.
   *
   * A search field over eight chips is a field you look past on the way to the chips — and
   * a box that takes focus the moment a picker opens turns a click into a click and a
   * glance somewhere else. Sections exist to keep these lists short, so on most rows the
   * whole answer is already on screen and the box would be furniture.
   *
   * Counted before the typing, and kept while there is anything in it: a box that vanished
   * as its own filter narrowed the row past the line would take the word you were still
   * typing with it.
   */
  const searchable = available.length >= SEARCH_FROM || typed !== ''

  const options = useMemo(
    () => (typed ? available.filter((tag) => tag.name.includes(typed)) : available).slice(0, 60),
    [available, typed]
  )

  /** A pick clears the filter and hands focus back, so the next tag is typed rather than
   *  clicked into. Leaving the word there would leave the list showing the one thing it
   *  can no longer offer — the tag just added. */
  function pick(tag: TagSeed) {
    setFilter('')
    inputRef.current?.focus()
    onPick(tag)
  }

  // Escape closes the picker whether or not there is a box to press it in. It used to be
  // the input's own handler, which was fine while the input was always there.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    // Inside the card that opened it, on `background` so it is a step down from the card
    // rather than another sheet of the same grey. No indent: it is the width of the card,
    // which is already narrow, and the ＋ that opened it is directly above.
    <div className="mx-2 mb-2 flex flex-col gap-2 rounded-lg border border-border bg-background p-2">
      {/* No Close button: the ➕ that opened this closes it, and it is drawn active while
          the picker is up. A second way out earns its place only where the first is hard
          to find, and that one is directly above. Escape works too. */}
      {searchable && (
        <input
          autoFocus
          ref={inputRef}
          value={filter}
          onChange={(event) => setFilter(event.target.value.toLowerCase())}
          placeholder="blue_hair"
          spellCheck={false}
          className="min-h-8 rounded-lg border border-border bg-surface px-2 font-mono text-xs outline-none focus:border-accent"
        />
      )}

      {all === null ? (
        <p className="px-1 py-2 text-xs text-muted">Reading tags…</p>
      ) : (
        // Every option on screen at once, however tall that makes the panel. It used to
        // stop at 12rem and scroll, which put half the list below a fold in a box that was
        // itself inside the page's scroll, so finding a tag meant a second scrollbar nested
        // in the first. What bounds this is the 60 options above, and the filter box —
        // when there is one — for when that is not enough.
        //
        // One flat block, no headings. It was divided by *form group* — a tag hidden until
        // the tag it hung off was on the post — and that idea moved up a level to the
        // section's own dependencies, where the whole row appears or does not. A picker
        // showing a row's tags needs no further division; it is one row's worth.
        <div className="flex flex-wrap gap-1">
          {options.map((tag) => (
            <TagOption key={tag.id} tag={tag} onPick={pick} />
          ))}

          {options.length === 0 && (
            <p className="px-1 py-2 text-xs text-muted">
              {typed
                ? 'No tag on this row matches — new ones are named on the Tags screen.'
                : 'No tags on this row yet.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * One offered tag. The same chip wherever it lands, marks included — a tag drawn one way
 * above a rule and another way below it read as two kinds of thing, and it is one tag
 * either way. Its colour is its own category's, since a row is no longer one category's
 * worth of tags.
 */
function TagOption({ tag, onPick }: { tag: Tag; onPick: (tag: TagSeed) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick({ name: tag.name, category: tag.category })}
      className={`flex min-h-7 items-center gap-1.5 rounded border border-border bg-surface px-2 font-mono text-xs transition-colors hover:border-accent ${categoryColor(tag.category)}`}
    >
      <TagMark mark={tag.mark} />
      {tagLabel(tag.name)}
    </button>
  )
}
