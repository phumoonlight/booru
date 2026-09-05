import { useEffect, useMemo, useRef, useState } from 'react'
import { TAG_PATTERN, categoryColor, categoryLabel, categoryOrder, type Tag } from '@common/tags'
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
 * Every category gets a row, the empty ones included: that row's ＋ is the only way to put
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

/** Called when a tag is coined, which is the only thing here that can make it stale. */
function invalidateIndex(): void {
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
  disabled = false,
  imply = false,
  recommend = false,
}: {
  value: TagSeed[]
  onChange: (next: TagSeed[]) => void
  label?: string
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

  const add = (tag: TagSeed) => {
    if (value.some((t) => t.name === tag.name)) return
    onChange([...value, tag])
  }

  return (
    <section className={`flex flex-col gap-1 ${disabled ? 'opacity-50' : ''}`}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</h2>

      {rows.map((category) => (
        <div key={category} className="flex flex-col">
          <div className="flex flex-wrap items-center gap-1 py-0.5">
            <span className="w-32 shrink-0 text-xs uppercase tracking-wide text-muted">
              {categoryLabel(category)}
            </span>
            {value
              .filter((tag) => tag.category === category)
              .map((tag) => (
                <span
                  key={tag.name}
                  className={`flex items-center rounded bg-surface pl-2 font-mono text-xs ${categoryColor(category)}`}
                >
                  {tag.name}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(value.filter((t) => t.name !== tag.name))}
                    aria-label={`Remove ${tag.name}`}
                    className="flex min-h-7 items-center px-1.5 text-muted hover:text-[#ff5d5f]"
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
              className={`flex min-h-7 items-center rounded border px-2 text-xs transition-colors ${
                adding === category
                  ? 'border-accent text-accent'
                  : 'border-border text-muted hover:border-accent hover:text-foreground'
              }`}
            >
              ＋
            </button>
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
        <div className="flex flex-wrap items-baseline gap-1 pt-1">
          {/* Accent, where every category label is grey: these two rows are the only ones
              on the field that something other than you put there, and a rule that goes
              unnoticed is a rule you stop trusting. */}
          <span className="w-32 shrink-0 text-xs font-semibold uppercase tracking-wide text-accent">
            Implied
          </span>
          {implied.map((name) => (
            <span
              key={name}
              title="Added by a rule on the Tag rules screen"
              className="rounded bg-background px-2 py-0.5 font-mono text-xs text-muted"
            >
              {name}
            </span>
          ))}
        </div>
      )}

      {/*
        What usually goes with what is already on the post — a press each, and nothing
        happens to the ones you don't press. The line above is what the rules did; this one
        is what they are asking about, which is why these are buttons and those are not.
      */}
      {offered.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-1 pt-1">
          <span className="w-32 shrink-0 text-xs font-semibold uppercase tracking-wide text-accent">
            Recommended
          </span>
          {offered.map((name) => (
            <button
              key={name}
              type="button"
              disabled={disabled}
              onClick={() => add({ name, category: categoryOf(name) })}
              title="Recommended by a rule on the Tag rules screen"
              className="rounded border border-border px-2 py-0.5 font-mono text-xs text-muted transition-colors hover:border-accent hover:text-foreground disabled:opacity-50"
            >
              + {name}
            </button>
          ))}
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
 * Coining a tag is still possible and still deliberate: a name matching nothing offers a
 * create row, and the tag it creates belongs to *this* category, which is the whole reason
 * to add tags from here rather than from a box that has to guess.
 */
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const typed = filter.trim().toLowerCase()
  const options = useMemo(() => {
    const taken = new Set(exclude)
    return (all ?? [])
      .filter((tag) => tag.category === category && !taken.has(tag.name))
      .filter((tag) => (typed ? tag.name.includes(typed) : true))
      .slice(0, 60)
  }, [all, category, exclude, typed])

  // Offered only when it is a name and nothing already answers to it — a create row beside
  // an exact match is how a board ends up holding the same tag twice.
  const coinable =
    typed.length > 0 &&
    TAG_PATTERN.test(typed) &&
    !exclude.includes(typed) &&
    !(all ?? []).some((tag) => tag.name === typed)

  /** A pick clears the filter and hands focus back, so the next tag is typed rather than
   *  clicked into. Leaving the word there would leave the list showing the one thing it
   *  can no longer offer — the tag just added. */
  function pick(tag: TagSeed) {
    setFilter('')
    inputRef.current?.focus()
    onPick(tag)
  }

  async function coin() {
    setBusy(true)
    setError('')
    const result = await window.api.createTag(typed, category)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    // The board has a name it did not have a moment ago, and every field on screen is
    // reading the same copy of that list.
    invalidateIndex()
    pick({ name: result.name, category })
  }

  return (
    <div className="mb-2 ml-32 flex flex-col gap-2 rounded-lg border border-border bg-surface p-2">
      {/* No Close button: the ＋ that opened this closes it, and it is drawn active while
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

      {error && <p className="text-xs text-[#ff5d5f]">{error}</p>}

      {all === null ? (
        <p className="px-1 py-2 text-xs text-muted">Reading tags…</p>
      ) : (
        <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto">
          {options.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => pick({ name: tag.name, category: tag.category })}
              className={`flex min-h-7 items-center rounded border border-border px-2 font-mono text-xs transition-colors hover:border-accent ${categoryColor(category)}`}
            >
              {tag.name}
            </button>
          ))}

          {options.length === 0 && !coinable && (
            <p className="px-1 py-2 text-xs text-muted">
              {typed ? 'No tag in this category matches.' : 'No tags in this category yet.'}
            </p>
          )}

          {coinable && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void coin()}
              title={`Create ${typed} as a ${categoryLabel(category)} tag`}
              className="flex min-h-7 items-center rounded border border-accent px-2 font-mono text-xs text-accent transition-colors hover:bg-background disabled:opacity-50"
            >
              ＋ {typed}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
