import { useEffect, useMemo, useRef, useState } from 'react'
import {
  categoryColor,
  categoryLabel,
  categoryOrder,
  formSectionLabel,

  markColor,
  type Tag,
} from '@common/tags'
import { tagLabel } from '@common/search'
import { impliedTags, type ImplicationRules } from '../../../shared/implications'
import { recommendedTags } from '../../../shared/recommendations'
import { useCatalogs } from '../catalogs'
import { useFormSections } from '../form-sections'
import type { FormSection } from '@common/data/form-sections'
import { useImplications } from '../implications'
import { useRecommendations } from '../recommendations'
import type { TagSeed } from './tag-seed'

/**
 * A post's tags, grouped by category, with a picker per row.
 *
 * The one tag editor both screens use: staging a post and editing one differ in when the
 * write happens, not in what a tag is. It replaced a single free-text box whose one job
 * it could not do — a name typed there had no category until the board was asked, so a
 * new tag was coined as General whatever it actually was, and `blue_hair` ended up on the
 * board twice in two categories. Choosing from the Color row cannot be wrong.
 *
 * Every category gets a row, the empty ones included: that row's ➕ is the only way to put
 * a first tag in it, and the categories a post has nothing in are exactly the ones worth
 * being reminded of while tagging.
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
 * The categories drawn in the right-hand column of the field.
 *
 * Named rather than left to the layout, and the names are a judgement about *how much work
 * each holds* rather than about what kind of thing it is. These are the answers that come
 * from looking once — what it is from, who is in it, what they are doing, how explicit it
 * is, whatever else it is of, and the notes about the file — each of them a tag or two,
 * decided and done.
 *
 * The left is `appearance`, the long sectioned half you work down a row at a time, with
 * `artist` above it. Splitting them this way is what keeps the two columns roughly the same
 * height while a post is being tagged, rather than a full column and an empty one.
 *
 * A category outside `TAG_CATEGORIES` — one retired by a re-cut and not yet re-filed — lands
 * on the left, which is as good a place as any and is visibly not where you expected it.
 */
/**
 * How many tags a row needs before its picker offers a search box. Below it the whole row
 * is on screen already and a field would be one more thing between you and the chips.
 */
const SEARCH_FROM = 10

const RIGHT_COLUMN = new Set([
  'copyright',
  'character',
  'activity',
  'sexual',
  'general',
  'meta',
])

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

function useTagIndex(): Tag[] | null {
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
  catalogs = false,
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
  /**
   * Put 📚 Catalogs on the heading row: the saved sets of tags, applied by name. On
   * wherever a post is tagged — the queue's cards, the bulk bar and the post editor — since
   * "these twelve tags again" is the same job whether the post exists yet or not.
   */
  catalogs?: boolean
}) {
  // Which row's picker is open, or null. A row is a category *and* a section now, so the
  // two together are what identifies one — a plain category would open Appearance's own
  // picker and every one of its sections' at once.
  const [adding, setAdding] = useState<{ category: string; section: string | null } | null>(null)
  const all = useTagIndex()
  const rules = useImplications()
  const recommendations = useRecommendations()
  const formSections = useFormSections()

  const names = value.map((tag) => tag.name)
  const rows = categoryOrder(value.map((tag) => tag.category))

  // Derived every render, never state: the rules are the truth about what follows from
  // what is on the post, so there is nothing here to fall out of step with the rows.
  const implied = imply ? impliedTags(names, rules) : []
  const offered = recommend
    ? recommendedTags(names, recommendations, [...names, ...implied])
    : []

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
   * Which row a chosen tag is drawn on inside its category, or null for the category's own.
   * Read off the board's index, like the mark, since a `TagSeed` is a name and a category.
   *
   * Nothing can go wrong here the way it could when the sections were a fixed list: the
   * rows are derived from these same values, so every stored section has a row by
   * construction and no chip can fall between two of them.
   */
  const slotOf = (name: string): string | null =>
    (all ?? []).find((tag) => tag.name === name)?.form_section ?? null

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


  /**
   * A whole catalog at once. The names arrive without categories — that is `TagCatalogs`'s
   * own decision, so a recategorized tag cannot leave a stale colour behind in a file — and
   * they are looked up here, in the same index the picker offers from.
   *
   * **A name the index does not have is skipped**, which is the rule everywhere else on
   * this field: nothing here coins a tag. A catalog can name one that has since been
   * deleted or renamed, and quietly recreating it at upload is exactly how a board grows a
   * second spelling of something.
   */
  const applyCatalog = (names: string[]) => {
    const known = new Map((all ?? []).map((tag) => [tag.name, tag.category]))
    const next = [...value]
    for (const name of names) {
      const category = known.get(name)
      if (category === undefined || next.some((tag) => tag.name === name)) continue
      next.push({ name, category })
    }
    onChange(next)
  }

  /** One category: its heading, and a row per section it has. Named so both columns
   *  can draw one — which column a category is in is a decision, not a flow. */
  const renderCategory = (category: string) => {
    // The rows this category offers, one per section it has — read off the board's
    // whole index rather than off the tags on this post, since a row has to be there
    // before anything is on it. Naming a *new* section is the Tags screen's job, which
    // is the one thing this cannot show.
    // The board's own rows, in the order it put them in — including one nothing is filed
    // under yet, since a row's ＋ is how the first tag gets onto it. A section is drawn when
    // its **dependencies are met**: none, and it is always there; some, and it waits for
    // them. `hair color` is always drawn, `blue archive` when `blue_archive` is on the post.
    const listed = formSections[category] ?? []

    // A section the post already has a tag on is drawn whatever its condition says — the
    // same carve-out the unfiled chips get, and for the same reason: a row that vanishes
    // takes a tag you can no longer see or take off, and the post editor would save it
    // straight back.
    const onPost = new Set(
      value.filter((tag) => tag.category === category).map((tag) => slotOf(tag.name))
    )

    const shown = listed
      .filter((section) => dependenciesMet(section, satisfied) || onPost.has(section.name))
      .map((section) => section.name)

    // Anything a tag names that the board's list has never heard of — a row deleted while
    // tags still pointed at it. Drawn at the end rather than lost, which is the same
    // courtesy `categoryOrder` does an unknown category.
    //
    // Checked against the **whole** list, not against `shown`. This went through
    // `orderFormSections` once, which appends whatever is missing from the list it is
    // handed — so every section a tag was filed on came straight back after being hidden,
    // and a dependency did nothing at all on the only rows that ever have tags. A row that
    // is hidden and a row that no longer exists are not the same thing, and only the list
    // knows which is which.
    const known = new Set(listed.map((section) => section.name))
    const unlisted = [
      ...new Set(
        (all ?? [])
          .filter((tag) => tag.category === category)
          .map((tag) => tag.form_section)
          .filter((name): name is string => !!name && !known.has(name))
      ),
    ].sort()

    const sections = [...shown, ...unlisted]

    // **A tag with no section is not offered.** The category's own row lost its ＋: a
    // row is a section now, and a category is the heading over its sections. What that
    // costs is that a tag nobody has filed cannot be picked, which is the point — an
    // unfiled tag is one the vocabulary has not decided about yet, and the Tags screen
    // is where that is decided.
    //
    // It is still *shown* if the post already carries it. Not being offered is a
    // statement about the picker; a chip that is on the post and drawn nowhere would be
    // a tag you cannot see and cannot take off, which the post editor would then save
    // straight back.
    const orphans = value.filter(
      (tag) => tag.category === category && slotOf(tag.name) === null
    )

    // A category with no sections and nothing unfiled on the post is not a heading over
    // anything, so it is not drawn at all. Empty *sections* cannot happen — one exists
    // only while a tag names it.
    if (sections.length === 0 && orphans.length === 0) return null

    return (
      <div key={category} className="flex flex-col">
        {/* The category itself: a heading, in its own colour, and whatever the post
            carries that nothing has filed. No ＋ — there is nothing for it to add to. */}
        <SectionRow
          category={category}
          section={null}
          tags={orphans}
          onRemove={remove}
          markOf={markOf}
          disabled={disabled}
        />
        {sections.map((section) => (
          <SectionRow
            key={section}
            category={category}
            section={section}
            tags={value.filter(
              (tag) => tag.category === category && slotOf(tag.name) === section
            )}
            onRemove={remove}
            markOf={markOf}
            disabled={disabled}
            open={adding?.category === category && adding.section === section}
            onToggle={() =>
              setAdding((current) =>
                current?.category === category && current.section === section
                  ? null
                  : { category, section }
              )
            }
            picker={
              <TagPicker
                category={category}
                section={section}
                all={all}
                exclude={names}
                onPick={add}
                onClose={() => setAdding(null)}
              />
            }
          />
        ))}
      </div>
    )
  }

  return (
    <section className={`flex flex-col gap-1 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex min-h-7 items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</h2>
        {catalogs && (
          <CatalogMenu all={all} have={names} onApply={applyCatalog} disabled={disabled} />
        )}
        {actions}
      </div>

      {/*
        Two columns, and which category goes in which is *named* rather than left to the
        flow. The right-hand three are what a post is *of* — the series, who is in it, and
        the notes about the file — and they are answered once, from the picture, usually
        before anything else. The left is what is in the picture, which is the long half and
        the one you work down. Splitting them by side is the difference between a form you
        read top to bottom and one you fill in two passes, which is how tagging actually
        goes.

        A grid of two explicit columns rather than a flowing one: CSS columns and
        `grid-flow-row` both decide sides by height, so a category would change columns the
        moment a picker opened — the one thing here that changes height, and the moment you
        are looking at it. `items-start` so a short column keeps its own height.
      */}
      <div className="grid items-start gap-x-6 sm:grid-cols-2">
        <div className="flex flex-col">
          {rows.filter((category) => !RIGHT_COLUMN.has(category)).map(renderCategory)}
        </div>
        <div className="flex flex-col">
          {rows.filter((category) => RIGHT_COLUMN.has(category)).map(renderCategory)}
        </div>
      </div>

      {/* A board with no rows at all can offer nothing, since a category no longer has a ＋
          of its own — which is a blank form and looks like a broken one. Said once, rather
          than as an empty heading per category.
          
          Tested on the *sections*, not on whether any tag carries one: a row named and not
          yet filled is exactly the state this notice must not appear in, and it is the
          ordinary first step now that a section is made before anything goes on it. */}
      {all !== null && Object.values(formSections).every((rows) => rows.length === 0) && (
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
          {/* Accent, where every category label is grey: these two rows are the only ones
              on the field that something other than you put there, and a rule that goes
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
 * One row of the field: a label, the tags on it, and — for a section — a ＋ and the picker
 * it opens.
 *
 * A row is a **form section**, and the category above them is a heading. The website has no
 * such division and never will: it shows the category, which is what a tag *is*. This is
 * where your hand goes, and a single Appearance row holding four kinds of thing is a row
 * you have to read before you can aim at it. `tags.form_section` has the whole argument.
 *
 * **The category row cannot add.** It carries the colour, the name, and any tag the post
 * already has that no section claims; its ＋ went with the decision that a tag is offered
 * through its section or not at all. A tag nobody has filed is one the vocabulary has not
 * decided about, and the Tags screen is where that is decided — not here, with a picture in
 * front of you and a post half tagged.
 */
function SectionRow({
  category,
  section,
  tags,
  onRemove,
  markOf,
  disabled,
  open = false,
  onToggle,
  picker,
}: {
  category: string
  /** null is the category's own row: a heading, and whatever is on the post unfiled. */
  section: string | null
  /** The tags to draw here, already narrowed to this row by the caller. */
  tags: TagSeed[]
  /** Takes one off the post — the whole post, not just this row, which is the caller's. */
  onRemove: (name: string) => void
  markOf: (name: string) => string | null
  disabled: boolean
  open?: boolean
  onToggle?: () => void
  picker?: React.ReactNode
}) {
  const label = section === null ? categoryLabel(category) : formSectionLabel(section)

  return (
    <div className="flex flex-col">
      <div className="flex items-baseline gap-1 py-0.5">
        <span
          // The category leads its group and wears its own colour — the same colour it has
          // in the grid, the picker and on a post, which is how a category is recognised
          // everywhere else and was the one thing this label was not saying. A section is a
          // division inside that heading and steps in to say so, staying grey: it is a
          // label of the board's own making, not one of the eight the app knows.
          //
          // The step is on the label alone — the chips stay in one column down the whole
          // field, which is what makes it readable as a list of what the post carries
          // rather than as an outline.
          //
          // **One line each.** A section is two or three words of somebody's own making —
          // `underwear accessories` — and wrapping made a row two lines tall to hold a
          // label, which put the ＋ beside it in a different place on every row and turned a
          // column of targets into a ragged one. Wider than it was, so most names fit
          // outright, and `truncate` with the whole name in `title` for the ones that do
          // not: a row you aim at is worth more than a label you can read to the end.
          title={label}
          className={`w-50 shrink-0 truncate text-xs uppercase tracking-wide ${
            section === null ? `font-semibold ${categoryColor(category)}` : 'pl-3 text-muted'
          }`}
        >
          {label}
        </span>
        {/* Its own wrapping box, so a second line of tags starts where the first one
            did rather than under the label. Baseline against the label, not centre:
            what should line up is the two lots of text, and a chip is taller than its
            own text by the remove button inside it. */}
        <div className="flex flex-1 flex-wrap items-center gap-1">
          {tags.map((tag) => (
            <span
              key={tag.name}
              // A bordered pill, the way the tags offered in the picker are: the
              // chosen ones sat on a fill with no edge, so a row of them read as one
              // band of surface rather than as several tags. Rounded fully to keep
              // the two apart all the same — offered is square, chosen is a pill.
              className={`flex items-center gap-1.5 rounded-full border border-border bg-surface pl-2.5 font-mono text-xs ${categoryColor(category)}`}
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
          {onToggle && (
            <button
              type="button"
              disabled={disabled}
              onClick={onToggle}
              aria-label={`Add a ${label} tag`}
              title={`Add a ${label} tag`}
              className={`flex min-h-7 items-center rounded-full border px-2 text-xs transition-colors ${
                open
                  ? 'border-accent text-accent'
                  : 'border-border text-muted hover:border-accent hover:text-foreground'
              }`}
            >
              <span aria-hidden>➕</span>
            </button>
          )}
        </div>
      </div>

      {/* Left open on purpose: tagging is done in runs — a post gets three colours or
          four pieces of clothing at once — and a picker that closed on each pick
          charged a click to reopen for every tag after the first. Close and Escape are
          the way out. */}
      {open && picker}
    </div>
  )
}

/**
 * The saved catalogs, as a menu on the tag field's heading row.
 *
 * A press applies the whole set, which is the entire point: a catalog is the answer to
 * "these twelve tags again", and anything more ceremonious than one press is the retyping
 * it was made to end. There is no confirmation because there is nothing to confirm — every
 * tag it adds is a chip on the rows below with its own ✕, and the field is where you were
 * looking anyway.
 *
 * **Each row says what it would actually add**, not how many tags it holds. A catalog is
 * used repeatedly against posts that already share half of it, and "＋3" is the difference
 * between a press that does something and one that does nothing — which is also why a row
 * with nothing left to give is drawn as spent rather than hidden. Naming a tag the board no
 * longer has counts as nothing to give: `applyCatalog` skips it, so the count must too.
 *
 * A menu rather than a row of buttons, unlike the catalogs panel on the Tags screen. That
 * screen is *about* catalogs and has room to lay them out; this is a line above a tag field
 * on a card in a queue of twenty, and the tags are what the card is for.
 */
function CatalogMenu({
  all,
  have,
  onApply,
  disabled,
}: {
  all: Tag[] | null
  /** What the post already carries, so a row can say what is left of it. */
  have: string[]
  onApply: (names: string[]) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const catalogs = useCatalogs()
  const names = Object.keys(catalogs)

  // Nothing saved is nothing to offer, and a menu that opens on one line of prose is worse
  // than the absence of the button: the Tags screen is where a catalog is made, and this
  // control appearing the moment there is one is how that connects.
  if (names.length === 0) return null

  const known = new Set((all ?? []).map((tag) => tag.name))
  const taken = new Set(have)
  const addable = (name: string): string[] =>
    catalogs[name].filter((tag) => known.has(tag) && !taken.has(tag))

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        aria-expanded={open}
        title="Apply a saved set of tags"
        // The same shape as the import button that sits beside it on a queue card, rather
        // than one of the page's own: this row is a heading with controls riding on it, and
        // they should be the same height and the same weight as each other.
        className={`flex min-h-7 items-center rounded px-1 text-xs transition-colors disabled:opacity-50 ${
          open ? 'text-accent' : 'text-muted hover:text-foreground'
        }`}
      >
        <span aria-hidden>📚</span>&nbsp;Catalogs
      </button>

      {open && (
        // Floating, like the rule editor's note: unfolded in place it would push the
        // category rows down the card and take them back up again on close, on the one
        // screen where the rows are what you are reading.
        <div className="absolute left-0 top-full z-20 mt-1 flex w-64 flex-col gap-0.5 rounded-lg border border-border bg-background p-1 shadow-lg">
          {names.map((name) => {
            const adding = addable(name)
            return (
              <button
                key={name}
                type="button"
                disabled={adding.length === 0}
                onClick={() => {
                  onApply(catalogs[name])
                  setOpen(false)
                }}
                title={
                  adding.length === 0
                    ? `${name} adds nothing this post does not already have`
                    : adding.map(tagLabel).join(', ')
                }
                className="flex min-h-8 items-center gap-2 rounded px-2 text-left text-xs transition-colors hover:bg-surface disabled:text-muted disabled:hover:bg-transparent"
              >
                <span aria-hidden>📚</span>
                <span className="min-w-0 flex-1 truncate">{name}</span>
                <span className="shrink-0 tabular-nums text-muted">
                  {adding.length === 0 ? '✓' : `＋${adding.length}`}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * The tags of one category, to pick from.
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
 * **One row's tags, and no filtering beyond that.** The narrowing that used to happen here
 * happens a level up now: a form section is drawn or not drawn by its own dependencies, so
 * by the time a picker is open the question "which of these could apply" has already been
 * answered by the row appearing at all.
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
  category,
  section,
  all,
  exclude,
  onPick,
  onClose,
}: {
  category: string
  /** The row this was opened from — null is the category's own, holding what is on no
   *  section. A picker offers one row's tags and no others: the ＋ you pressed is the
   *  promise about where what you pick will land. */
  section: string | null
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
        tag.category === category &&
        !taken.has(tag.name) &&
        // The row's own tags, and no others: the ＋ you pressed is a promise about where
        // what you pick will land. That is the whole of the filtering now — what a row
        // *is* is decided by the section's own dependencies, one level up, where the row
        // either appears or does not.
        (tag.form_section ?? null) === section
    )
  }, [all, category, section, exclude])

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
    // Barely indented, on purpose. It used to line up with the chips, at the full 200px of
    // the label column, which was worth it while a row was the width of the window; in half
    // of one that is most of the panel spent on alignment, and a panel is not a row — its
    // own border already says where it starts, and the ＋ that opened it is directly above.
    <div className="mb-2 ml-4 flex flex-col gap-2 rounded-lg border border-border bg-surface p-2">
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
          className="min-h-8 rounded-lg border border-border bg-background px-2 font-mono text-xs outline-none focus:border-accent"
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
        // showing a row's tags needs no further division; it is one row's worth of one
        // category.
        <div className="flex flex-wrap gap-1">
          {options.map((tag) => (
            <TagOption key={tag.id} tag={tag} category={category} onPick={pick} />
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
 * either way. The colour dot is still `TagMarks`, read off the name.
 */
function TagOption({
  tag,
  category,
  onPick,
}: {
  tag: Tag
  category: string
  onPick: (tag: TagSeed) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onPick({ name: tag.name, category: tag.category })}
      className={`flex min-h-7 items-center gap-1.5 rounded border border-border px-2 font-mono text-xs transition-colors hover:border-accent ${categoryColor(category)}`}
    >
      <TagMark mark={tag.mark} />
      {tagLabel(tag.name)}
    </button>
  )
}
