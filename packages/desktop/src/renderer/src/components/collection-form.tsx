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

  // Laid out as a form rather than a toolbar now that it lives in a modal: what the shelf is
  // called on one line, what it is flagged as on the next, and the one way to finish at the
  // foot — each with a label, since a mark box holding 🎴 says nothing about what it is for.
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex gap-2">
        <label className="flex w-20 shrink-0 flex-col gap-1 text-xs text-muted">
          Mark
          <input
            value={input.mark}
            onChange={(event) => setInput({ ...input, mark: event.target.value })}
            placeholder="🎴"
            className={`${FIELD} w-full text-foreground`}
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
          Name
          <input
            autoFocus
            value={input.name}
            onChange={(event) => setInput({ ...input, name: event.target.value })}
            placeholder="My collection"
            className={`${FIELD} w-full text-foreground`}
          />
        </label>
      </div>

      {/* Two flags about the shelf, each a pill that lights up (`pillToggle`). The rating
          was a menu of two, which is a toggle that has to be opened to be read — and a
          third tier would bring the menu back, since the column is free text. */}
      <div role="group" aria-label="Flags" className="flex flex-col gap-1">
        <span aria-hidden className="text-xs text-muted">
          Flags
        </span>
        <div className="flex gap-2">
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
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border pt-3">
        {error && <p className="text-xs text-[#ff5d5f]">{error}</p>}
        <button type="submit" disabled={busy} className={`${BUTTON_SUBMIT_ON_SURFACE} ml-auto`}>
          <span aria-hidden>✅</span> {submitLabel}
        </button>
      </div>
    </form>
  )
}

/** A shelf's name with its mark in front, as every heading and card draws it. */
export function shelfTitle(collection: { name: string; mark: string | null }): string {
  return collection.mark ? `${collection.mark} ${collection.name}` : collection.name
}
