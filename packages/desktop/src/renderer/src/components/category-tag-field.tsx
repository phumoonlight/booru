import { useEffect, useMemo, useRef, useState } from 'react'
import {
  COLOR_NAMES,
  categoryColor,
  categoryLabel,
  categoryOrder,
  colorSwatch,
  subcategoryLabel,
  subcategoryOrder,
  type Tag,
} from '@common/tags'
import { tagLabel } from '@common/search'
import { impliedTags, type ImplicationRules } from '../../../shared/implications'
import { recommendedTags } from '../../../shared/recommendations'
import { useImplications } from '../implications'
import { useRecommendations } from '../recommendations'
import type { TagSeed } from './tag-field'

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
  const [adding, setAdding] = useState<string | null>(null)
  const all = useTagIndex()
  const rules = useImplications()
  const recommendations = useRecommendations()

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
   * The same for the glyph. A chosen tag is a name and a category — `TagSeed` — so its
   * emoji comes from the board's index rather than from the chip, and a tag that has not
   * loaded yet, or was coined a moment ago, simply has none until it does.
   */
  const emojiOf = (name: string): string | null =>
    (all ?? []).find((tag) => tag.name === name)?.emoji ?? null

  const add = (tag: TagSeed) => {
    if (value.some((t) => t.name === tag.name)) return
    onChange([...value, tag])
  }

  return (
    <section className={`flex flex-col gap-1 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex min-h-7 items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</h2>
        {actions}
      </div>

      {rows.map((category) => (
        <div key={category} className="flex flex-col">
          <div className="flex items-baseline gap-1 py-0.5">
            <span className="w-32 shrink-0 text-xs uppercase tracking-wide text-muted">
              {categoryLabel(category)}
            </span>
            {/* Its own wrapping box, so a second line of tags starts where the first one
                did rather than under the label. Baseline against the label, not centre:
                what should line up is the two lots of text, and a chip is taller than its
                own text by the remove button inside it. */}
            <div className="flex flex-1 flex-wrap items-center gap-1">
              {value
                .filter((tag) => tag.category === category)
                .map((tag) => (
                  <span
                    key={tag.name}
                    // A bordered pill, the way the tags offered in the picker are: the
                    // chosen ones sat on a fill with no edge, so a row of them read as one
                    // band of surface rather than as several tags. Rounded fully to keep
                    // the two apart all the same — offered is square, chosen is a pill.
                    className={`flex items-center gap-1.5 rounded-full border border-border bg-surface pl-2.5 font-mono text-xs ${categoryColor(category)}`}
                  >
                    <TagMarks name={tag.name} emoji={emojiOf(tag.name)} />
                    {tagLabel(tag.name)}
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onChange(value.filter((t) => t.name !== tag.name))}
                      aria-label={`Remove ${tagLabel(tag.name)}`}
                      className="flex min-h-7 items-center rounded-r-full pr-2.5 pl-1 text-muted hover:text-[#ff5d5f]"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              <button
                type="button"
                disabled={disabled}
                onClick={() => setAdding(adding === category ? null : category)}
                aria-label={`Add a ${categoryLabel(category)} tag`}
                title={`Add a ${categoryLabel(category)} tag`}
                className={`flex min-h-7 items-center rounded-full border px-2 text-xs transition-colors ${
                  adding === category
                    ? 'border-accent text-accent'
                    : 'border-border text-muted hover:border-accent hover:text-foreground'
                }`}
              >
                <span aria-hidden>➕</span>
              </button>
            </div>
          </div>

          {/* Left open on purpose: tagging is done in runs — a post gets three colours or
              four pieces of clothing at once — and a picker that closed on each pick
              charged a click to reopen for every tag after the first. Close and Escape are
              the way out. */}
          {adding === category && (
            <TagPicker
              category={category}
              all={all}
              exclude={names}
              onPick={add}
              onClose={() => setAdding(null)}
            />
          )}
        </div>
      ))}

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
          <span className="w-32 shrink-0 text-xs font-semibold uppercase tracking-wide text-accent">
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
          <span className="w-32 shrink-0 text-xs font-semibold uppercase tracking-wide text-accent">
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
 * The tags of one category, to pick from.
 *
 * It filters the index in memory rather than querying per keystroke — that index is
 * `main/tag-cache.ts`, a day-old copy of every name on the board, which is what makes
 * narrowing a category to a substring a local operation instead of a request per letter.
 * Counts are not drawn: they order the list, most used first, and that ordering is the
 * answer to what a number beside each name was being read for.
 *
 * **It only offers what the board already has.** Coining a tag from here is gone: a tag
 * created while tagging is created in a hurry, by someone looking at a picture rather than
 * at the vocabulary, which is how a board ends up with `twintail`, `twintails` and
 * `twin_tails`. Naming one is the Tags screen's job, where the whole list is in front of
 * you and a near-duplicate is visible before you make it.
 *
 * **Subgroups split the list up**, each behind a rule and under its own heading —
 * `tags.category2`, set per tag on the Tags screen. Clothes on a real board is two hundred
 * names in one wrapped block whose useful part is the garments; `dress` and `uniform`
 * above a rule, then "dress color", then "underwear", is that block made readable. A tag
 * with no subgroup sits in the first block, which is where most tags belong, and a
 * category with no subgroups at all looks exactly as it did.
 *
 * It used to guess this from the name instead: a tag starting with a colour word went
 * below the rule. That worked for `blue_dress` and for nothing else — `bra` and `panties`
 * belong together and share no prefix, and `blonde_hair` was filed as a variant of `hair`
 * when it is the only spelling that tag has. Grouping is a judgement about the vocabulary,
 * so it is stored beside the vocabulary rather than re-derived here. The colour *dot* is
 * unchanged: reading a colour off a name is a fine thing to guess, and painting the wrong
 * one costs nothing.
 */

/**
 * Every colour this recognises, longest first — so `light_blue_dress` is a light blue
 * dress rather than a blue one that starts with `light`.
 *
 * It once read the board's own `color` category instead, which could not work:
 * `pink_underwear` only split when a bare `pink` tag existed, so a board that had never
 * coined one — most of them — got no splitting and no reason why. The words come with the
 * language, not with a board's vocabulary, which is why this outlived that category.
 */
const COLOR_PREFIXES = [...COLOR_NAMES].sort((a, b) => b.length - a.length)

/**
 * What a tag carries in front of its name: the emoji stored on its row, if it has one,
 * and the colour it names, painted. Either, both or neither.
 *
 * The two arrive by opposite routes on purpose. The colour is read off the name here,
 * because guessing it is free and painting the wrong one costs nothing; the emoji is
 * passed in from the tag's own row, because it is a judgement about the tag that only the
 * board can hold — it used to be a record in code, which meant a new tag's glyph was a
 * commit and an installer away from being seen.
 *
 * Drawn on the chips a post already carries as well as the ones offered, so a tag looks
 * the same before and after it is picked — and on the row where it landed, which is the
 * only place a mis-picked colour is ever noticed.
 */
function TagMarks({ name, emoji }: { name: string; emoji: string | null }) {
  const split = splitColor(name, COLOR_PREFIXES)

  return (
    <>
      {emoji && (
        <span aria-hidden className="leading-none">
          {emoji}
        </span>
      )}
      {split && (
        <span
          aria-hidden
          // The border keeps white and black from disappearing into the two grounds they
          // would otherwise match.
          style={{ background: colorSwatch(split.color) }}
          className="size-3 shrink-0 rounded-full border border-border"
        />
      )}
    </>
  )
}

/** A tag's colour prefix, or null. */
function splitColor(name: string, colors: string[]): { color: string; rest: string } | null {
  for (const color of colors) {
    if (name.startsWith(`${color}_`) && name.length > color.length + 1) {
      return { color, rest: name.slice(color.length + 1) }
    }
  }
  return null
}
function TagPicker({
  category,
  all,
  exclude,
  onPick,
  onClose,
}: {
  category: string
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

  const { loose, grouped } = useMemo(() => {
    const taken = new Set(exclude)
    const options = (all ?? [])
      .filter((tag) => tag.category === category && !taken.has(tag.name))
      .filter((tag) => (typed ? tag.name.includes(typed) : true))
      .slice(0, 60)

    // The index's own order — most used first — for the block that is most of the picking.
    const loose = options.filter((tag) => !tag.category2)

    // A-Z inside a subgroup, where the index order is the wrong one: a subgroup is a set of
    // answers to one question, and `black_dress`, `blue_dress`, `red_dress` is read across
    // rather than searched, which popularity order would scramble for no gain.
    const grouped = subcategoryOrder(options.map((tag) => tag.category2)).map(
      (name) =>
        [
          name,
          options
            .filter((tag) => tag.category2 === name)
            .sort((a, b) => a.name.localeCompare(b.name)),
        ] as [string, Tag[]]
    )

    return { loose, grouped }
  }, [all, category, exclude, typed])

  /** A pick clears the filter and hands focus back, so the next tag is typed rather than
   *  clicked into. Leaving the word there would leave the list showing the one thing it
   *  can no longer offer — the tag just added. */
  function pick(tag: TagSeed) {
    setFilter('')
    inputRef.current?.focus()
    onPick(tag)
  }

  return (
    <div className="mb-2 ml-32 flex flex-col gap-2 rounded-lg border border-border bg-surface p-2">
      {/* No Close button: the ➕ that opened this closes it, and it is drawn active while
          the picker is up. A second way out earns its place only where the first is hard
          to find, and that one is directly above. Escape works too. */}
      <input
        autoFocus
        ref={inputRef}
        value={filter}
        onChange={(event) => setFilter(event.target.value.toLowerCase())}
        onKeyDown={(event) => event.key === 'Escape' && onClose()}
        placeholder={`filter ${categoryLabel(category).toLowerCase()} tags`}
        spellCheck={false}
        className="min-h-8 rounded-lg border border-border bg-background px-2 font-mono text-xs outline-none focus:border-accent"
      />

      {all === null ? (
        <p className="px-1 py-2 text-xs text-muted">Reading tags…</p>
      ) : (
        <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">
          {/* The ungrouped tags, under no heading of their own: they are the category, whose
              name is already on the row that opened this, and a second label would only push
              the tags a line further down. */}
          {loose.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {loose.map((tag) => (
                <TagOption key={tag.id} tag={tag} category={category} onPick={pick} />
              ))}
            </div>
          )}

          {grouped.map(([name, group], at) => (
            <div
              key={name}
              // Ruled off from whatever is above — the ungrouped block, or the subgroup
              // before this one — except when this is the first thing in the picker.
              className={`flex flex-col gap-1 ${
                loose.length > 0 || at > 0 ? 'border-t border-border pt-2' : ''
              }`}
            >
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                {subcategoryLabel(name)}
              </h3>
              <div className="flex flex-wrap gap-1">
                {group.map((tag) => (
                  <TagOption key={tag.id} tag={tag} category={category} onPick={pick} />
                ))}
              </div>
            </div>
          ))}

          {loose.length === 0 && grouped.length === 0 && (
            <p className="px-1 py-2 text-xs text-muted">
              {typed
                ? 'No tag in this category matches — new ones are named on the Tags screen.'
                : 'No tags in this category yet.'}
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
      <TagMarks name={tag.name} emoji={tag.emoji} />
      {tagLabel(tag.name)}
    </button>
  )
}
