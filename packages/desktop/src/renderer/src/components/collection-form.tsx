import { useState } from 'react'
import { RATING_LABEL, RATINGS } from '@common/search'
import type { CollectionInput } from '../../../shared/api'
import { BUTTON_SUBMIT_ON_SURFACE } from './buttons'
import { FIELD } from './panel'

/**
 * What a shelf is — its mark, its name, its rating and whether it is generated work — as
 * one form, for naming a new one and for editing one. The same four controls in both
 * places, because a shelf made without a rating is the R-18 shelf that turns up on the
 * website with the setting off, and every image on it takes that rating.
 *
 * `onSubmit` answers with the refusal to show, or null once it has landed.
 */
export function CollectionForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: CollectionInput
  submitLabel: string
  onSubmit: (input: CollectionInput) => Promise<string | null>
}) {
  const [input, setInput] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (busy) return
    setBusy(true)
    const refusal = await onSubmit(input)
    setBusy(false)
    setError(refusal)
  }

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          value={input.mark}
          onChange={(event) => setInput({ ...input, mark: event.target.value })}
          aria-label="Mark"
          placeholder="🎴"
          className={`${FIELD} w-20`}
        />
        <input
          autoFocus
          value={input.name}
          onChange={(event) => setInput({ ...input, name: event.target.value })}
          aria-label="Name"
          placeholder="Ukiyo-e studies"
          className={`${FIELD} min-w-40 flex-1`}
        />
        <select
          value={input.rating}
          onChange={(event) =>
            setInput({ ...input, rating: event.target.value as CollectionInput['rating'] })
          }
          aria-label="Rating"
          className={FIELD}
        >
          {RATINGS.map((value) => (
            <option key={value} value={value}>
              {RATING_LABEL[value]}
            </option>
          ))}
        </select>
        {/* A checkbox rather than a pair of segments: it is one fact about the shelf, off
            for most of them, and the website is what does something with it — the AI board
            this replaced is a filter there now. */}
        <label className="flex min-h-9 items-center gap-1.5 text-sm text-muted">
          <input
            type="checkbox"
            checked={input.is_ai}
            onChange={(event) => setInput({ ...input, is_ai: event.target.checked })}
            className="accent-accent"
          />
          <span aria-hidden>🤖</span> AI
        </label>
        <button type="submit" disabled={busy} className={BUTTON_SUBMIT_ON_SURFACE}>
          <span aria-hidden>✅</span> {submitLabel}
        </button>
      </form>
      {error && <p className="text-xs text-[#ff5d5f]">{error}</p>}
    </>
  )
}

/** A shelf's name with its mark in front, as every heading and card draws it. */
export function shelfTitle(collection: { name: string; mark: string | null }): string {
  return collection.mark ? `${collection.mark} ${collection.name}` : collection.name
}
