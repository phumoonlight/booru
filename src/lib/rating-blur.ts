import { RATINGS, type Rating } from '@common/search'

/**
 * Which ratings arrive blurred. The adult tail is covered by default; everything
 * milder shows as-is. Visitors override this per browser from the sidebar's ⚙ panel —
 * it is a display preference, not access control, so it never leaves the client.
 */
export const DEFAULT_BLURRED_RATINGS: readonly Rating[] = ['e4', 'e5']

export const BLUR_STORAGE_KEY = 'blurred_ratings'

/** Lives on <html>; CSS matches one tier with `[data-blur-ratings~='e5']`. */
export const BLUR_ATTR = 'data-blur-ratings'

/** Space-separated and in RATINGS order, so the attribute reads the same every time. */
export function serializeBlurred(ratings: readonly Rating[]): string {
  return RATINGS.filter((rating) => ratings.includes(rating)).join(' ')
}

/** `null` means nothing stored yet — an empty string is a deliberate "blur nothing". */
export function parseBlurred(value: string | null): Rating[] {
  if (value === null) return [...DEFAULT_BLURRED_RATINGS]
  const parts = value.split(' ')
  return RATINGS.filter((rating) => parts.includes(rating))
}

export const DEFAULT_BLUR_ATTR_VALUE = serializeBlurred(DEFAULT_BLURRED_RATINGS)

/**
 * Runs while the browser parses <head>, before the first paint, so a stored preference
 * replaces the server's default without a frame of unblurred thumbnails. Standalone on
 * purpose — nothing here can be imported at that point.
 */
export const BLUR_INIT_SCRIPT = `(function(){try{var v=localStorage.getItem(${JSON.stringify(
  BLUR_STORAGE_KEY
)});if(v!==null)document.documentElement.setAttribute(${JSON.stringify(
  BLUR_ATTR
)},v)}catch(e){}})()`
