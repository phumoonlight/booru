'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { suggestTags, type TagSuggestion } from '@/lib/actions/tags'
import { CATEGORY_COLOR } from '@/components/tag-list'
import type { TagCategory } from '@/lib/tags'

export type TagSeed = { name: string; category: TagCategory }

/**
 * Committed chips *and* the half-typed word. The draft belongs to the value because a
 * form submitted mid-word must still keep that word — the same reason the hidden input
 * below joins it on.
 */
export type TagFieldValue = { tags: TagSeed[]; draft: string }

export const EMPTY_TAGS: TagFieldValue = { tags: [], draft: '' }

/** The value as the server actions read it: one space-separated `tags` string. */
export function tagsToInput({ tags, draft }: TagFieldValue): string {
  return [...tags.map((tag) => tag.name), draft.trim()].filter(Boolean).join(' ')
}

/** Anything a tag name can't hold is dropped as it's typed — whitespace survives to split on. */
const STRIP = /[^a-z0-9_().\-\s]+/g

/**
 * The tag editor: committed tags become chips in their category colour and what you're
 * still typing looks up existing tags, so reusing `black_hair` is a keystroke and coining
 * `blackhair` by accident takes effort. Whitespace ends a tag — the same rule the old
 * space-separated textarea ran on, which also means pasting a whole tag string still works.
 *
 * Two ways to drive it. `name` + `initialTags` keeps the state in here and submits a hidden
 * field, which is all a plain form needs. `value` + `onChange` hands the tags to the parent
 * instead — that's the upload queue, where one editor per staged file sits in a list that
 * also gets written to from the bulk bar above it.
 */
export function TagField({
  name,
  initialTags = [],
  value,
  onChange,
  label = 'Tags',
  hint = true,
  disabled = false,
  placeholder,
}: {
  name?: string
  initialTags?: TagSeed[]
  value?: TagFieldValue
  onChange?: (next: TagFieldValue) => void
  label?: string
  hint?: boolean
  disabled?: boolean
  placeholder?: string
}) {
  const [own, setOwn] = useState<TagFieldValue>({ tags: initialTags, draft: '' })
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([])
  const [active, setActive] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const listId = `${id}-list`

  const state = value ?? own
  const { tags, draft } = state

  function update(next: TagFieldValue) {
    if (value) onChange?.(next)
    else setOwn(next)
  }

  // One lookup per pause in typing, and only the newest answer may land — a slow reply for
  // `bl` must not overwrite the results already shown for `blue`.
  useEffect(() => {
    const query = draft.trim()
    // An empty box shows no list, so the last results can just sit there unread
    if (!query) return
    let current = true
    const timer = setTimeout(() => {
      suggestTags(query)
        .catch(() => [])
        .then((found) => {
          if (!current) return
          setSuggestions(found)
          setActive(-1)
        })
    }, 150)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [draft])

  const chosen = new Set(tags.map((tag) => tag.name))
  const open = draft.trim().length > 0
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
    update({ tags: merged([entry]), draft: '' })
    setSuggestions([])
    setActive(-1)
    inputRef.current?.focus()
  }

  function handleChange(raw: string) {
    const parts = raw.toLowerCase().replace(STRIP, '').split(/\s+/)
    const rest = parts.pop() ?? ''
    const added = parts.filter(Boolean).map((part) => ({ name: part, category: categoryOf(part) }))
    update({ tags: merged(added), draft: rest })
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
        // An empty box leaves Enter to the form, where it means Save
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
        setSuggestions([])
        setActive(-1)
        break
      case 'Backspace':
        if (draft === '') update({ tags: tags.slice(0, -1), draft })
        break
    }
  }

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label htmlFor={`${id}-input`}>{label}</label>
      {name && <input type="hidden" name={name} value={tagsToInput(state)} />}

      <div
        className={`flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface p-1.5 focus-within:border-accent ${
          disabled ? 'opacity-50' : ''
        }`}
      >
        {tags.map((tag) => (
          <span
            key={tag.name}
            className={`flex items-center rounded bg-background pl-2 font-mono text-xs ${CATEGORY_COLOR[tag.category]}`}
          >
            {tag.name}
            <button
              type="button"
              disabled={disabled}
              onClick={() => update({ tags: tags.filter((t) => t.name !== tag.name), draft })}
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
              setSuggestions([])
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
                  } ${CATEGORY_COLOR[option.category]}`}
                >
                  <span className="truncate">{option.name}</span>
                  <span className="tabular-nums text-muted">{option.post_count}</span>
                </li>
              ))}
              {options.length === 0 && (
                <li className="px-2 py-1.5 text-xs text-muted">
                  No existing tag — Enter adds “{draft.trim()}”
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      {hint && (
        <p className="text-xs text-muted">Space or Enter adds a tag, ↑↓ picks a suggestion.</p>
      )}
    </div>
  )
}
