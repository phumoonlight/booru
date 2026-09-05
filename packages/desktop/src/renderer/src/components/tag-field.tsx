import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { categoryColor, type TagCategory } from '@common/tags'
import { impliedTags, type ImplicationRules } from '../../../shared/implications'
import { recommendedTags } from '../../../shared/recommendations'
import { useImplications } from '../implications'
import { useRecommendations } from '../recommendations'
import type { TagSuggestion } from '../../../shared/api'

export type TagSeed = { name: string; category: TagCategory }

/**
 * Committed chips *and* the half-typed word. The draft belongs to the value because a
 * queue submitted mid-word must still keep that word — the same reason `tagsToInput`
 * joins it on.
 */
export type TagFieldValue = { tags: TagSeed[]; draft: string }

export const EMPTY_TAGS: TagFieldValue = { tags: [], draft: '' }

/**
 * The value as the upload pipeline reads it: one space-separated `tags` string.
 *
 * With `rules`, what they imply is appended — the implied tags are shown beside the
 * field rather than inside it, so this is the one place they join the list the post is
 * actually made with. Without them it is exactly what was typed, which is what the
 * Implications screen's own boxes want.
 */
export function tagsToInput({ tags, draft }: TagFieldValue, rules?: ImplicationRules): string {
  const typed = [...tags.map((tag) => tag.name), draft.trim()].filter(Boolean)
  return [...typed, ...(rules ? impliedTags(typed, rules) : [])].join(' ')
}

/**
 * The committed chips plus the half-typed word, which is a whole tag as far as a form
 * that is about to be submitted is concerned. What `tagsToInput` joins, as a list.
 */
export function namesOf({ tags, draft }: TagFieldValue): string[] {
  const typed = draft.trim()
  const names = tags.map((tag) => tag.name)
  if (typed && !names.includes(typed)) names.push(typed)
  return names
}

/** Anything a tag name can't hold is dropped as it's typed — whitespace survives to split on. */
const STRIP = /[^a-z0-9_().\-\s]+/g

/**
 * The tag editor, ported from the web's src/components/tag-field.tsx. Committed tags
 * become chips in their category colour and what you're still typing looks up existing
 * tags, so reusing `black_hair` is a keystroke and coining `blackhair` by accident takes
 * effort. Whitespace ends a tag, which also means pasting a whole tag string works.
 *
 * The only difference from the web's is where the suggestions come from: a server action
 * there, the preload bridge here. The query behind both is the same function
 * (`searchTags` in `@common/data/shared`).
 *
 * The two things it does that the web's doesn't are both the tag rules, and they sit
 * under the box rather than in it — the box stays exactly what you typed, and everything
 * a rule had a hand in reads as a consequence of that rather than as something you did.
 * **Implied** is what is going up whether or not you look: `white_bra` lists `bra`,
 * because the broad tag is the one that gets forgotten, and `tagsToInput` appends them at
 * submit, which is the only place the two lists meet. **Recommended** is the other kind — the
 * tags that usually go with these, one button each, nothing added until pressed. Both
 * rule sets are per machine and edited on the Tag rules screen.
 */
export function TagField({
  value,
  onChange,
  label = 'Tags',
  hint = true,
  disabled = false,
  placeholder,
  applyRules = true,
}: {
  value: TagFieldValue
  onChange: (next: TagFieldValue) => void
  label?: string
  hint?: boolean
  disabled?: boolean
  placeholder?: string
  /**
   * Off for the boxes on the Tag rules screen, which is where the rules are written:
   * typing `white_bra` there means the name itself, not a post that has it, and a field
   * that answered by listing what it implies — or offering what usually goes with it —
   * would be applying the rules to the rule being written.
   */
  applyRules?: boolean
}) {
  // Results carry the word they answer, so the list can tell "nothing matches" from
  // "the lookup for what you have typed hasn't come back yet" — the two used to look
  // identical, and the honest-looking wrong one was shown first.
  const [result, setResult] = useState<{ query: string; items: TagSuggestion[] }>({
    query: '',
    items: [],
  })
  // Escape and blur close the list outright; typing opens it again
  const [dismissed, setDismissed] = useState(false)
  const [active, setActive] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const rules = useImplications()
  const recommendations = useRecommendations()
  const id = useId()
  const listId = `${id}-list`

  const { tags, draft } = value

  // One lookup per pause in typing, and only the newest answer may land — a slow reply for
  // `bl` must not overwrite the results already shown for `blue`.
  useEffect(() => {
    const query = draft.trim()
    // An empty box shows no list, so the last results can just sit there unread
    if (!query) return
    let current = true
    const timer = setTimeout(() => {
      window.api
        .suggestTags(query)
        .catch(() => [])
        .then((found) => {
          if (!current) return
          setResult({ query, items: found })
          setActive(-1)
        })
    }, 150)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [draft])

  // Derived, never state: the rules are the truth about what follows from what is typed,
  // so there is nothing here to fall out of step with the chips above it. The draft counts
  // because `tagsToInput` counts it — a queue submitted mid-word uploads that word.
  const named = [...tags.map((tag) => tag.name), ...(draft.trim() ? [draft.trim()] : [])]
  const implied = applyRules ? impliedTags(named, rules) : []

  // Offered, not applied: these are the tags that usually go *with* what is already on
  // the post, and only the person looking at the picture knows which of them do. Anything
  // the post is already getting — typed or implied — is left out, since a chip that adds
  // nothing is a chip that wastes a press.
  const offered = applyRules
    ? recommendedTags(named, recommendations, [...named, ...implied])
    : []

  const chosen = new Set(tags.map((tag) => tag.name))
  const typed = draft.trim()
  const open = typed.length > 0 && !dismissed
  // Debounce plus round trip: until the answer for this exact word lands, the list has
  // nothing to say about it, and the previous word's results would be a lie.
  const loading = result.query !== typed
  const suggestions = loading ? [] : result.items
  const options = open ? suggestions.filter((option) => !chosen.has(option.name)) : []
  const highlighted = active >= 0 ? options[active] : undefined

  /** The chip list with `entries` appended, minus the ones already on it. */
  function merged(entries: TagSeed[]): TagSeed[] {
    const next = [...tags]
    for (const entry of entries) {
      if (!next.some((tag) => tag.name === entry.name)) next.push(entry)
    }
    return next
  }

  /** A name typed freehand is new until proven otherwise, and new tags start out general. */
  const categoryOf = (tagName: string): TagCategory =>
    suggestions.find((option) => option.name === tagName)?.category ?? 'general'


  function accept(entry: TagSeed) {
    onChange({ tags: merged([entry]), draft: '' })
    setActive(-1)
    inputRef.current?.focus()
  }

  function handleChange(raw: string) {
    setDismissed(false)
    const parts = raw.toLowerCase().replace(STRIP, '').split(/\s+/)
    const rest = parts.pop() ?? ''
    const added = parts.filter(Boolean).map((part) => ({ name: part, category: categoryOf(part) }))
    onChange({ tags: merged(added), draft: rest })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActive((i) => (options.length === 0 ? -1 : (i + 1) % options.length))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActive((i) => (options.length === 0 ? -1 : (i <= 0 ? options.length : i) - 1))
        break
      case 'Enter':
        if (!highlighted && !draft.trim()) return
        event.preventDefault()
        accept(highlighted ?? { name: draft.trim(), category: 'general' })
        break
      case 'Tab':
        // Tab is only stolen to take a highlighted suggestion; otherwise focus must move on
        if (!highlighted) return
        event.preventDefault()
        accept(highlighted)
        break
      case 'Escape':
        setDismissed(true)
        setActive(-1)
        break
      // Backspace on an empty box used to eat the last chip. It is the key you hit to
      // fix a typo, and with the word already gone the next press took a tag that was
      // right — silently, above the cursor, while you were looking at what you were
      // typing. Chips come off by their own ✕ and nothing else.
    }
  }

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label htmlFor={`${id}-input`}>{label}</label>

      <div
        className={`flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface p-1.5 focus-within:border-accent ${
          disabled ? 'opacity-50' : ''
        }`}
      >
        {tags.map((tag) => (
          <span
            key={tag.name}
            className={`flex items-center rounded bg-background pl-2 font-mono text-xs ${categoryColor(tag.category)}`}
          >
            {tag.name}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange({ tags: tags.filter((t) => t.name !== tag.name), draft })}
              aria-label={`Remove ${tag.name}`}
              className="flex min-h-7 items-center px-1.5 text-muted hover:text-red-400"
            >
              ✕
            </button>
          </span>
        ))}

        <div className="relative min-w-24 flex-1">
          <input
            id={`${id}-input`}
            ref={inputRef}
            value={draft}
            disabled={disabled}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              setDismissed(true)
              setActive(-1)
            }}
            placeholder={placeholder ?? (tags.length > 0 ? 'add tag' : 'blue_hair solo')}
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={highlighted ? `${listId}-${active}` : undefined}
            className="min-h-7 w-full bg-transparent px-1 font-mono text-xs outline-none"
          />

          {/* Keeps the input focused through the click, so picking never closes the list first */}
          {open && (
            <ul
              id={listId}
              role="listbox"
              onMouseDown={(event) => event.preventDefault()}
              className="absolute left-0 top-full z-20 mt-1 max-h-56 w-56 max-w-[80vw] overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
            >
              {options.map((option, index) => (
                <li
                  key={option.name}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  onClick={() => accept(option)}
                  onMouseEnter={() => setActive(index)}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-2 py-1.5 font-mono text-xs ${
                    index === active ? 'bg-background' : ''
                  } ${categoryColor(option.category)}`}
                >
                  <span className="truncate">{option.name}</span>
                  <span className="tabular-nums text-muted">{option.post_count}</span>
                </li>
              ))}
              {loading && (
                <li className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted">
                  <span aria-hidden className="h-3 w-3 animate-pulse rounded-full bg-border" />
                  Searching tags…
                </li>
              )}
              {!loading && options.length === 0 && (
                <li className="px-2 py-1.5 text-xs text-muted">
                  No existing tag — Enter adds “{typed}”
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      {/*
        What the rules add, outside the box on purpose: inside it, a tag nobody typed
        looked exactly like one that was, and the box is the record of what you did by
        hand. Read-only for the same reason — these follow from the tags above it and from
        the Implications screen, so the way to change one is to change the tag or the rule.
        They are uploaded with the rest; `tagsToInput` is where the two lists join.
      */}
      {implied.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-1">
          <span className="mr-0.5 text-xs text-muted">Implied</span>
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
        happens to the ones you don't press. The line above is what the rules did; this
        one is what they are asking about, which is why they are buttons and the implied
        chips are not.
      */}
      {offered.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-1">
          <span className="mr-0.5 text-xs text-muted">Recommended</span>
          {offered.map((name) => (
            <button
              key={name}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ tags: merged([{ name, category: categoryOf(name) }]), draft })}
              title="Recommended by a rule on the Tag rules screen"
              className="rounded border border-border px-2 py-0.5 font-mono text-xs text-muted transition-colors hover:border-accent hover:text-foreground disabled:opacity-50"
            >
              + {name}
            </button>
          ))}
        </div>
      )}

      {hint && (
        <p className="text-xs text-muted">Space or Enter adds a tag, ↑↓ picks a suggestion.</p>
      )}
    </div>
  )
}
