'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { suggestTags } from '@/lib/actions/search'
import type { Tag } from '@/lib/data/tags'
import { queryTokens, searchHref, withoutTag } from '@/lib/search'

const DEBOUNCE_MS = 200

export function SearchBar({ initialQuery = '' }: { initialQuery?: string }) {
  const router = useRouter()
  const [value, setValue] = useState(initialQuery)
  // Suggestions carry the prefix they were fetched for, so a stale response
  // from a slower request can never be shown against newer input.
  const [fetched, setFetched] = useState<{ prefix: string; items: Tag[] }>({
    prefix: '',
    items: [],
  })
  const [highlighted, setHighlighted] = useState(-1)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // The token being typed is the one autocompleted; `-` prefix is stripped first
  const activeToken = value.split(/\s+/).pop() ?? ''
  const activePrefix = activeToken.startsWith('-') ? activeToken.slice(1) : activeToken

  useEffect(() => {
    if (!activePrefix) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const items = await suggestTags(activePrefix)
      if (!cancelled) setFetched({ prefix: activePrefix, items })
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [activePrefix])

  const suggestions = activePrefix && fetched.prefix === activePrefix ? fetched.items : []
  // Clamp rather than reset in an effect — the list shrinks as the user types
  const activeIndex = highlighted < suggestions.length ? highlighted : -1

  function submit(query: string) {
    setOpen(false)
    router.push(searchHref(query))
  }

  /** Replaces the token under the cursor with the chosen tag, keeping any `-`. */
  function applySuggestion(tag: Tag) {
    const tokens = value.split(/\s+/)
    const negated = (tokens[tokens.length - 1] ?? '').startsWith('-')
    tokens[tokens.length - 1] = `${negated ? '-' : ''}${tag.name}`
    // Trailing space starts a fresh token, which empties the suggestion list
    setValue(`${tokens.join(' ')} `)
    setHighlighted(-1)
    inputRef.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      applySuggestion(suggestions[activeIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setHighlighted(-1)
    }
  }

  const tokens = queryTokens(value)

  return (
    <div className="flex flex-col gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit(value)
        }}
        className="relative flex gap-2"
      >
        <input
          ref={inputRef}
          type="search"
          name="tags"
          value={value}
          placeholder="Search tags — use -tag to exclude"
          autoComplete="off"
          aria-label="Search tags"
          onChange={(e) => {
            setValue(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          // Delay so a tap on a suggestion registers before the list unmounts
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          className="min-h-11 flex-1 rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-background"
        >
          Search
        </button>

        {open && suggestions.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
            {suggestions.map((tag, i) => (
              <li key={tag.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applySuggestion(tag)}
                  className={`flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left text-sm ${
                    i === activeIndex ? 'bg-accent/20' : ''
                  }`}
                >
                  <span>{tag.name}</span>
                  <span className="text-xs tabular-nums text-muted">{tag.post_count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      {tokens.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {tokens.map(({ name, negated }) => (
            <li key={`${negated ? '-' : ''}${name}`}>
              <button
                type="button"
                onClick={() => submit(withoutTag(value, name))}
                aria-label={`Remove ${name}`}
                className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm ${
                  negated ? 'border-red-500/40 text-red-400' : 'border-border text-foreground'
                }`}
              >
                {negated && <span aria-hidden>−</span>}
                {name}
                <span aria-hidden className="text-muted">
                  ✕
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
