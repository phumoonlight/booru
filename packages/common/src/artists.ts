/**
 * What an artist is, spelled once — the tables, the object prefixes, and what counts as a
 * name or an address.
 *
 * An artist is a row on the desktop app's reading list: a name, the addresses where their
 * work is posted, a few example images, and when they were last caught up on. **It is
 * separate from every other feature**, and stays that way: not a tag (though the board has
 * an `artist` category), not a board, not a collection, and nowhere on the website —
 * `booru_web` holds no grant on these tables. So nothing here has an href.
 *
 * It lives in `packages/common` anyway, because that is where table names and queries live
 * (invariant 10), and a module that only one host compiles is still a module that must not
 * build its own client.
 */

/** The three tables, interpolated as identifiers by `@common/data/artists`. */
export const ARTIST_TABLES = {
  artists: 'artists',
  urls: 'artist_urls',
  images: 'artist_images',
} as const

/**
 * Object prefixes, beside the boards' and the collections' under one bucket. Flat, for the
 * reason a collection's are: `artist_images.file_name` is unique across the table, so the
 * name already identifies the image and a per-artist folder would buy nothing.
 */
export const ARTIST_IMAGE_PREFIX = 'artists/images'
export const ARTIST_THUMB_PREFIX = 'artists/thumbs'

export const ARTIST_NAME_MAX = 64

/** Long enough for any profile URL anybody pastes, short enough that a pasted paragraph is
 *  refused rather than stored. */
const ARTIST_URL_MAX = 500

const DEL = '\u007f'

/**
 * An artist's name, as it will be stored, or why it cannot be. Prose, like a collection's:
 * a handle keeps its capitals and its spaces, and case is ignored only for uniqueness.
 */
export function readArtistName(raw: string): { name: string } | { error: string } {
  const cleaned = [...raw]
    .map((ch) => (ch < ' ' || ch === DEL ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return { error: 'Type a name for the artist.' }
  if (cleaned.length > ARTIST_NAME_MAX) {
    return { error: `That name is too long (max ${ARTIST_NAME_MAX} characters).` }
  }
  return { name: cleaned }
}

/**
 * An address, normalized, or why it is not one.
 *
 * Through `URL` so the stored spelling is the parser's — a host in capitals and one in
 * lower case are one profile, and `artist_urls.url` being unique only means anything if
 * they are one string. http and https only: this is opened in a browser, and a
 * `javascript:` or `file:` address is not a place an artist posts.
 */
export function readArtistUrl(raw: string): { url: string } | { error: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { error: 'Paste an address.' }
  if (trimmed.length > ARTIST_URL_MAX) return { error: 'That address is too long.' }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { error: 'That is not an address — it should start with https://' }
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { error: 'Only http and https addresses.' }
  }
  return { url: parsed.href }
}
