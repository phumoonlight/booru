/**
 * Absolute site origin, used for metadataBase, canonicals, sitemap and robots.
 * Set NEXT_PUBLIC_SITE_URL in production; Vercel's own env var is the fallback so
 * preview deploys still emit sane absolute URLs.
 */
export const SITE_NAME = 'Pubooru'

export const SITE_DESCRIPTION =
  'A tag-centric image board — browse by tag, search with multiple tags, exclude with -tag.'

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/$/, '')

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`

  return 'http://localhost:3000'
}
