import type { MetadataRoute } from 'next'
import { SEARCH_PARAM } from '@common/search'
import { siteUrl } from '@/lib/site'

/**
 * Search results are an unbounded tag-combination space, so crawlers get the
 * gallery, post pages and /tags only — `?query=` URLs are also marked noindex by
 * the page itself (see the home page's generateMetadata).
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl()
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [`/?${SEARCH_PARAM}=`, `/*?${SEARCH_PARAM}=`],
    },
    sitemap: `${base}/sitemap.xml`,
  }
}
