import { useMemo, useRef, useState } from 'react'
import { categoryColor, categoryLabel, type Tag } from '@common/tags'
import { FIELD } from './panel'
import { useTagNames } from './tag-names'

/**
 * How a rule's right-hand side is named: a box, and the names it finds.
 *
 * It was 👆 Choose from the Tags grid, which turned the whole list below into a picker.
 * That read well on thirty tags and stopped working somewhere around a hundred: the answer
 * to a rule is *one name*, and finding it meant scrolling a page of folded categories with
 * a panel pinned over the top of it. A box is the same promise asked the other way round —
 * say what you are looking for rather than go and find it — and it still cannot name a tag
 * the board does not have, because every name comes off the index.
 */

/** How many matches are drawn. Enough to see you have narrowed it, short enough that the
 *  answer to a word too vague to be one name is "type more" rather than a second scroll. */
const MATCH_LIMIT = 8

/**
 * The box a consequence is added from: type, then click a name.
 *
 * **Nothing is added by typing.** The list under the box is the whole of what this control
 * can do, so a rule can still only name a tag the board has — the promise the grid picker
 * made, kept while dropping the scrolling that made it unusable on a real vocabulary. A
 * name that matches nothing says so, and naming it is the ➕ New tag at the top of this
 * screen.
 *
 * Matched against the stored spelling with spaces read as underscores, so the box takes
 * `blue archive` and `blue_archive` alike — the same courtesy the tag picker's box and the
 * grid's filter both offer.
 *
 * The list is derived as it is drawn rather than held in state, which is what keeps it
 * from being briefly wrong about what was typed — `Browse`'s box takes the same line.
 * What is already in the rule is left out, and so is the tag the rule is about: a tag
 * implying itself is the one rule that can never fire.
 */
export function RuleSearch({
  tag,
  chosen,
  onAdd,
  label,
}: {
  /** The tag the rule is about — excluded from its own consequences. */
  tag: string
  /** What the rule already names, so the list does not offer them twice. */
  chosen: string[]
  onAdd: (name: string) => void
  label: string
}) {
  const all = useTagNames()
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(-1)
  const box = useRef<HTMLInputElement>(null)

  const typed = query.trim().toLowerCase().replace(/ /g, '_')

  const matches = useMemo(() => {
    if (!typed) return []
    const taken = new Set([...chosen, tag])
    return (
      (all ?? [])
        .filter((option) => !taken.has(option.name) && option.name.includes(typed))
        // A tag whose name *starts* with what was typed is nearly always the one meant, and
        // the index arrives in count order, which on a board of several hundred puts a
        // popular tag that merely contains the word ahead of the one being spelled out.
        .sort((a, b) => Number(b.name.startsWith(typed)) - Number(a.name.startsWith(typed)))
        .slice(0, MATCH_LIMIT)
    )
  }, [all, chosen, tag, typed])

  // The list shrinks as the word grows, so the highlight has to be clamped rather than
  // reset in an effect — an index left pointing past the end would take Enter with it.
  const active = highlight < matches.length ? highlight : -1

  function add(name: string) {
    onAdd(name)
    // Cleared and handed back, so the next one is typed rather than reached for: adding
    // two or three consequences at a sitting is the ordinary shape of writing a rule.
    setQuery('')
    setHighlight(-1)
    box.current?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && query) {
      event.preventDefault()
      setQuery('')
      setHighlight(-1)
      return
    }
    if (matches.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((index) => (index + 1) % matches.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((index) => (index <= 0 ? matches.length - 1 : index - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      // With nothing highlighted the first match is what Enter means: it is the one the
      // list is already claiming is the answer.
      const picked = matches[active === -1 ? 0 : active]
      if (picked) add(picked.name)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={box}
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setHighlight(-1)
        }}
        onKeyDown={onKeyDown}
        aria-label={label}
        // An example rather than a description, which is this app's rule for a placeholder:
        // it shows the spelling and the separator at once, where "search tags" teaches
        // nothing a label has not already said.
        placeholder="blue_hair"
        className={FIELD}
      />

      {typed !== '' && (
        <ul className="flex flex-col">
          {matches.length === 0 ? (
            <li className="px-1 py-1 text-xs text-muted">
              No tag matches &ldquo;{query.trim()}&rdquo; — ➕ New tag names one.
            </li>
          ) : (
            matches.map((option, index) => (
              <Match
                key={option.id}
                tag={option}
                active={index === active}
                onPick={() => add(option.name)}
              />
            ))
          )}
        </ul>
      )}
    </div>
  )
}

/** One name the box found. The category is on it in its own colour — the one thing a bare
 *  name cannot say, and what tells two similar spellings apart. */
function Match({ tag, active, onPick }: { tag: Tag; active: boolean; onPick: () => void }) {
  return (
    <li>
      <button
        type="button"
        // `mousedown`, not `click`: the box keeps focus through a press, so the list does
        // not have to survive a blur to be clickable.
        onMouseDown={(event) => {
          event.preventDefault()
          onPick()
        }}
        className={`flex w-full items-baseline gap-2 rounded px-1 py-1 text-left text-xs transition-colors ${
          active ? 'bg-background' : 'hover:bg-background'
        }`}
      >
        <span className={`font-mono ${categoryColor(tag.category)}`}>{tag.name}</span>
        <span className="ml-auto text-[0.65rem] uppercase tracking-wide text-muted">
          {categoryLabel(tag.category)}
        </span>
      </button>
    </li>
  )
}
