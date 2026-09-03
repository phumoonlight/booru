'use client'

import { useLayoutEffect, useState, useSyncExternalStore } from 'react'
import {
  BLUR_ATTR,
  BLUR_STORAGE_KEY,
  DEFAULT_BLURRED_RATINGS,
  parseBlurred,
  serializeBlurred,
} from '@/lib/rating-blur'
import { RATING_COLOR, RATING_LABEL, RATINGS, type Rating } from '@common/search'

// A module-level store rather than component state: TagDrawer renders the sidebar twice
// (desktop column + mobile sheet), and both panels have to agree on what's checked.
let cached: Rating[] | null = null
const listeners = new Set<() => void>()

function readBlurred(): Rating[] {
  if (cached === null) {
    try {
      cached = parseBlurred(window.localStorage.getItem(BLUR_STORAGE_KEY))
    } catch {
      // Private mode / disabled storage — the defaults still apply for this page
      cached = [...DEFAULT_BLURRED_RATINGS]
    }
  }
  return cached
}

function writeBlurred(next: Rating[]) {
  cached = next
  const value = serializeBlurred(next)
  // The attribute is what actually blurs anything; storage only makes it stick.
  document.documentElement.setAttribute(BLUR_ATTR, value)
  try {
    window.localStorage.setItem(BLUR_STORAGE_KEY, value)
  } catch {
    // Nothing to do — the choice holds until the tab is closed
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const SERVER_BLURRED = [...DEFAULT_BLURRED_RATINGS]
const serverSnapshot = () => SERVER_BLURRED

/**
 * The sidebar's "Rating" heading plus a ⚙ that opens the blur options. Which tiers are
 * blurred is a per-browser preference, so the grid itself stays a plain server render and
 * only an attribute on <html> changes — see `lib/rating-blur.ts` and the CSS in globals.
 */
export function RatingDisplayOptions() {
  const [open, setOpen] = useState(false)
  const blurred = useSyncExternalStore(subscribe, readBlurred, serverSnapshot)

  // React's dev-only remount strips attributes it doesn't own from <html>, clearing what
  // the pre-paint script set. Putting it back here is a no-op in production.
  useLayoutEffect(() => {
    document.documentElement.setAttribute(BLUR_ATTR, serializeBlurred(readBlurred()))
  }, [])

  const toggle = (rating: Rating) =>
    writeBlurred(
      blurred.includes(rating) ? blurred.filter((r) => r !== rating) : [...blurred, rating]
    )

  return (
    // The mobile sheet closes on any click in its content (that's how navigating out of it
    // works), so these controls have to keep their clicks to themselves.
    <div onClick={(event) => event.stopPropagation()}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Rating</h2>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label="Display options"
          title="Display options"
          // Flush right so it sits over the rows' count column, and pulled back
          // vertically so the tap target doesn't make this heading taller than "Tags".
          className={`-my-2 flex min-h-9 items-center text-xs transition-[filter] ${
            open ? '' : 'brightness-150 grayscale hover:brightness-100 hover:grayscale-0'
          }`}
        >
          ⚙️
        </button>
      </div>

      {open && (
        <div className="mb-2 rounded-lg border border-border bg-surface p-2">
          <p className="mb-1 text-xs text-muted">Blur thumbnails rated:</p>
          <ul className="flex flex-col">
            {RATINGS.map((rating) => (
              <li key={rating}>
                <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={blurred.includes(rating)}
                    onChange={() => toggle(rating)}
                    className="size-4 accent-accent"
                  />
                  <span className={RATING_COLOR[rating]}>{RATING_LABEL[rating]}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
