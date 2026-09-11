import type { Board } from '@common/board'

/**
 * Whether the AI board is offered at all, as a cookie.
 *
 * A cookie for the reason the NSFW one is (`lib/nsfw.ts`): it has to be known while the
 * page is being rendered on the server, and the request is the only thing that reaches an
 * RSC. It sits beside that one rather than inside it because the two answer different
 * questions — NSFW is *which rows* a listing may contain, this is *whether a second
 * listing exists* — and folding them together would mean turning one on to get the other.
 *
 * What it changes is one nav item. `/ai-posts` is reachable either way, like every post's
 * own URL is: this is what the site volunteers to someone who has not asked for it, not a
 * gate. There are no accounts here to make it anything more.
 *
 * Nothing here reads the request, so the checkbox that writes the cookie and the RSC that
 * reads it can share one spelling — `lib/generative-server.ts` is the reading half.
 */
export const GENERATIVE_COOKIE = 'ai'

/** A year, the same as the NSFW cookie's: long enough to survive, short enough to expire. */
export const GENERATIVE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** The only value that counts as on. Anything else, including absence, is off. */
export const GENERATIVE_COOKIE_VALUE = '1'

/** The board a `/ai-posts` route reads. Named here so a page spells neither string. */
export const GENERATIVE_BOARD: Board = 'generative'
