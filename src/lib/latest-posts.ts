/**
 * How far `/posts` goes before it hands over to the collections.
 *
 * The feed of newest images is a front page, not an archive: it replaced the gallery, whose
 * whole browsing model was a tag search, and without a search a feed that scrolled to the
 * first upload would be a very long way to look for anything. So it stops at a hundred and
 * the button becomes a link to the shelf list, which is where the rest is findable — by
 * name, by tier, by whether it is AI.
 *
 * Its own module because both sides need it: the feed decides when the button turns into
 * the link, and the action refuses to read past it for a caller that is not the feed.
 */
export const LATEST_POSTS_LIMIT = 100
