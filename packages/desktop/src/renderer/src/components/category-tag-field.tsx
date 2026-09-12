import { useState } from 'react'
import { formSectionLabel, isSpacer } from '@common/tags'
import { tagLabel } from '@common/search'
import { impliedTags, type ImplicationRules } from '../../../shared/implications'
import { recommendedTags } from '../../../shared/recommendations'
import { useFormSections } from '../form-sections'
import { useImplications } from '../implications'
import { useRecommendations } from '../recommendations'
import { useTagNames } from './tag-names'
import { SectionRow } from './tag-section-row'
import { TagPicker } from './tag-picker'
import type { FormSection } from '@common/data/form-sections'
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
  const all = useTagNames()
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
