/**
 * Every value the website reads out of the environment, and the only file in `src/` that
 * touches `process.env`.
 *
 * It was three files — the name and origin in `lib/site.ts`, the image host in
 * `lib/images.ts`, the connection string beside the pool in `lib/db.ts` — which is three
 * places to look when a deployment is misconfigured and three chances for one of them to
 * spell a variable differently. What is configurable about this board is now a list you
 * can read in one screen.
 *
 * No `server-only`: the name and the image host are drawn by client components, and a
 * `NEXT_PUBLIC_*` variable is inlined at build the way it always was. The two private
 * values below are only ever called from `lib/db.ts`, which *is* `server-only` — and a
 * private variable is not inlined into a client bundle at all, so even a mistaken import
 * gets `undefined` rather than a connection string.
 *
 * Nothing here is `packages/common`'s business: invariant 4 is that a shared module never
 * reads the environment, precisely so the same file can compile in Electron's main
 * process, where none of these exist.
 */

/**
 * What the board is called — in the wordmark, the tab title, every OpenGraph card.
 *
 * A variable rather than a constant because the name is the one thing about a booru that
 * belongs to whoever is running it, and it appeared in eight files before it was one. The
 * default is deliberately plain: an unconfigured deployment should read as unnamed rather
 * than as somebody else's board.
 */
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || 'Booru'

export const SITE_DESCRIPTION =
  'An image board of hand-kept collections — the newest images, and every collection by name.'

/**
 * Absolute site origin, used for `metadataBase`, canonicals, the sitemap and robots.
 * Set `NEXT_PUBLIC_SITE_URL` in production; Vercel's own variables are the fallback so
 * preview deploys still emit sane absolute URLs.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/$/, '')

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`

  return 'http://localhost:3000'
}

/**
 * Where images are served from — the bucket's public origin, without its trailing slash.
 * `lib/images.ts` fills it into `@common/storage`'s path builders; the desktop app passes
 * its own, compiled into its bundle.
 */
export function cdnBase(): string {
  return (process.env.NEXT_PUBLIC_CDN_URL ?? '').replace(/\/+$/, '')
}

/** The board, as `booru_web`. Read only by `lib/db.ts`, which is `server-only`. */
export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL
}
