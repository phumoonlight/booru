import { useEffect, useRef, useState } from 'react'
import { categoryColor } from '@common/tags'
import type { Board } from '@common/board'
import type { TagSuggestion } from '../../../shared/api'
import { BUTTON, BUTTON_SUBMIT } from './buttons'

/**
 * Five names under the box, and no more.
 *
 * The box takes a whole query — several tags, exclusions, a rating — so the list under it
 * is an aid to spelling one word, not a way of browsing the vocabulary. That is the Tags
 * screen, which has the whole of it with counts and categories. Five is what can be read
 * without moving your eyes off what you were typing; a longer list would cover the top row
 * of the grid you are searching, to offer tags nobody was going to read.
 */
const SUGGESTION_LIMIT = 5

/**
 * The word being typed, and everything before it. Space-separated is the whole of the
 * query grammar (`splitQuery`), so the token being completed is the last one — this box
 * is typed left to right and a completion lands where the caret is.
 */
function typedToken(query: string): { before: string; token: string } {
  const cut = query.lastIndexOf(' ')
  return { before: query.slice(0, cut + 1), token: query.slice(cut + 1) }
}
/**
 * The query box, its five names, and the two buttons either side of it.
 *
 * A component rather than a block of the screen because the completion is a small machine
 * of its own — a round trip, a highlight, four keys and a list that has to be right about
 * a word that is still being typed — and none of it is anything the grid below needs to
 * know about. What crosses the line is the query and the press of Search.
 */
export function BrowseSearchBox({
  query,
  setQuery,
  submitted,
  loading,
  board,
  onRefresh,
  onSubmit,
}: {
  query: string
  setQuery: (next: string) => void
  /** The query the rows on screen answer, which is the only thing Clear is about. */
  submitted: string
  loading: boolean
  board: Board
  onRefresh: () => void
  onSubmit: (next: string) => void
}) {
  // Autocomplete for the box below. The names come from the same cached index the tag
  // fields use (`main/tag-cache.ts`), so a keystroke is a prefix match in memory rather
  // than a query — which is why there is no debounce here to explain away.
  const [options, setOptions] = useState<TagSuggestion[]>([])
  const [highlight, setHighlight] = useState(-1)
  // Shut by Escape or by looking elsewhere, without throwing the names away: coming back
  // to a box you were already typing in should not have to re-earn its list.
  const [shut, setShut] = useState(false)
  const box = useRef<HTMLInputElement>(null)

  // A leading `-` excludes the tag it names, so it is part of the query and not of the
  // word: `-sol` is asking to complete `solo`. A `:` is a metatag — `rating:`, `start:` —
  // and there is nothing in the tag index to complete it with.
  const { before, token } = typedToken(query)
  const needle = token.startsWith('-') ? token.slice(1) : token
  const completing = needle !== '' && !needle.includes(':')

  useEffect(() => {
    if (!completing) return
    let alive = true
    void window.api.suggestTags(needle, board).then((tags) => {
      if (alive) setOptions(tags)
    })
    return () => {
      alive = false
    }
  }, [needle, completing, board])

  /**
   * What is actually under the box, worked out as it is drawn rather than stored.
   *
   * The read behind `options` is a round trip, so between a keystroke and its answer the
   * list is holding names for the word as it was one letter ago. Filtering here means the
   * list never shows a name that does not match what is on screen — it goes briefly short
   * rather than briefly wrong — and it is what keeps the state out of the effect.
   *
   * What the rest of the query already names is left out, the tag just completed
   * included, which would otherwise head its own list.
   */
  const already = new Set(
    before
      .split(' ')
      .filter(Boolean)
      .map((word) => (word.startsWith('-') ? word.slice(1) : word))
  )
  const showing =
    shut || !completing
      ? []
      : options
          .filter((tag) => tag.name.startsWith(needle) && !already.has(tag.name))
          .slice(0, SUGGESTION_LIMIT)

  /** Puts a name in place of the word being typed, with the trailing space that starts
   *  the next one — the list is for building a query, not for ending one. */
  function complete(name: string) {
    setQuery(`${before}${token.startsWith('-') ? '-' : ''}${name} `)
    setHighlight(-1)
    box.current?.focus()
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(query.trim())
      }}
      className="flex items-center gap-2"
    >
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        title="Read these posts again"
        className={BUTTON}
      >
        {/* Faded, not spun. A spinner on a single glyph is a lot of motion in the corner
              of the eye for a read that is usually over before it is noticed, and an emoji
              rotating about its own box wobbles. Dimming says the same thing quietly. */}
        <span aria-hidden className={`transition-opacity ${loading ? 'opacity-30' : ''}`}>
          🔄
        </span>
        Refresh
      </button>
      {/* The box and its list are one thing on the row, so the list can be positioned
            against the box rather than against the toolbar. */}
      <div className="relative flex-1">
        <input
          ref={box}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setShut(false)
            // Another letter is another list; keeping the row number would move the
            // highlight onto whatever name happens to land there.
            setHighlight(-1)
          }}
          onFocus={() => setShut(false)}
          // Closed on the way out rather than on a click, which would land after the
          // list had already gone; the options refuse the focus in the first place.
          onBlur={() => setShut(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setShut(true)
              return
            }
            if (showing.length === 0) return
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setHighlight((at) => (at + 1) % showing.length)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setHighlight((at) => (at <= 0 ? showing.length : at) - 1)
            } else if (event.key === 'Enter' && highlight >= 0) {
              // Enter on a highlighted name completes it instead of searching: the
              // query is half-typed, and running it now is never what was meant.
              event.preventDefault()
              complete(showing[highlight].name)
            }
          }}
          placeholder="1girl blue_hair -solo rating:r18"
          spellCheck={false}
          className="min-h-9 w-full rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-sm outline-none focus:border-accent"
        />
        {showing.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-border bg-surface">
            {showing.map((tag, at) => (
              <li key={tag.name}>
                <button
                  type="button"
                  // Never takes the focus, so the box keeps it and the blur above never
                  // fires — a list that closed on mousedown could not be clicked.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => complete(tag.name)}
                  onMouseEnter={() => setHighlight(at)}
                  className={`flex w-full items-center gap-3 px-3 py-1.5 text-left font-mono text-sm ${
                    at === highlight ? 'bg-background' : ''
                  }`}
                >
                  {/* The name as it is typed, underscores and all — this box takes a
                        query, not a label. Its colour is its category, which is what says
                        a `blue_hair` from a `blue_archive` at a glance. */}
                  <span className={categoryColor(tag.category)}>{tag.name}</span>
                  <span className="ml-auto text-xs text-muted">{tag.post_count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="submit" className={BUTTON_SUBMIT}>
        <span aria-hidden>🔍</span> Search
      </button>
      {submitted !== '' && (
        <button
          type="button"
          onClick={() => {
            setQuery('')
            onSubmit('')
          }}
          className={BUTTON}
        >
          <span aria-hidden>🧹</span> Clear
        </button>
      )}
    </form>
  )
}
