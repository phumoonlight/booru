import { useState } from 'react'
import { RATING_LABEL } from '@common/search'
import type { CollectionInput } from '../../../shared/api'
import { BUTTON_SUBMIT_ON_SURFACE, pillToggle } from './buttons'
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
        {/* Two flags about the shelf, each a pill that lights up (`pillToggle`). The rating
            was a menu of two, which is a toggle that has to be opened to be read — and a
            third tier would bring the menu back, since the column is free text. */}
        <button
          type="button"
          onClick={() => setInput({ ...input, rating: input.rating === 'r' ? 'g' : 'r' })}
          aria-pressed={input.rating === 'r'}
          className={pillToggle(input.rating === 'r', 'red')}
        >
          <span aria-hidden>🔞</span> {RATING_LABEL.r}
        </button>
        <button
          type="button"
          onClick={() => setInput({ ...input, is_ai: !input.is_ai })}
          aria-pressed={input.is_ai}
          className={pillToggle(input.is_ai, 'blue')}
        >
          <span aria-hidden>🤖</span> AI
        </button>
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
