import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'

/**
 * Search results are an unbounded tag-combination space, so crawlers get the
 * gallery, post pages and /tags only — `?tags=` URLs are also marked noindex by
 * the page itself (see the home page's generateMetadata).
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl()
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/login', '/upload', '/?tags=', '/*?tags='],
    },
    sitemap: `${base}/sitemap.xml`,
  }
}
