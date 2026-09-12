import { useEffect, useMemo, useRef, useState } from 'react'
import { categoryColor, type Tag } from '@common/tags'
import { tagLabel } from '@common/search'
import { TagMark } from './tag-mark'
import type { TagSeed } from './tag-seed'

/**
 * How many tags a row needs before its picker offers a search box. Below it the whole row
 * is on screen already and a field would be one more thing between you and the chips.
 */
const SEARCH_FROM = 10

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
export function TagPicker({
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
