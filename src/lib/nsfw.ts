import { RATINGS, SAFE_RATINGS, type Rating } from '@common/search'

/**
 * Whether the adult tiers appear in the listing, as a cookie.
 *
 * A cookie rather than `localStorage`, which is where every other preference on this
 * site lives, because this one has to be known *before* the rows are chosen. Blur was a
 * client decision — the server sent every post and CSS obscured some of them — so a
 * value the browser read after paint was enough. Filtering is a decision about the
 * query, made in an RSC, and the request is the only thing that reaches it.
 *
 * It is a preference, not access control: `/posts/123` renders whatever it holds either
 * way, and the site has no accounts to attach an age to. What it changes is what the
 * gallery volunteers to someone who has not asked.
 *
 * Nothing here reads the request, so the checkbox that writes the cookie and the RSC
 * that reads it can share one spelling — see `lib/nsfw-server.ts` for the reading half,
 * which is `server-only` and cannot be imported into the client component.
 */
export const NSFW_COOKIE = 'nsfw'

/** A year. Long enough that the choice survives; short enough to expire on a shared machine. */
export const NSFW_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** The only value that counts as on. Anything else, including absence, is off. */
export const NSFW_COOKIE_VALUE = '1'

/** What a request may list. The query narrows within it and can never lift it. */
export function ratingsFor(nsfw: boolean): readonly Rating[] {
  return nsfw ? RATINGS : SAFE_RATINGS
}
