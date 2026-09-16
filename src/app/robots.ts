import type { MetadataRoute } from 'next'
import { collectionsHref } from '@common/collections'
import { siteUrl } from '@/config'

/**
 * A search of the shelf list is one visitor's slice of `/collections`, which is indexed
 * whole — so crawlers skip its query strings, and the page marks them `noindex` as well. A
 * shelf narrowed by its tag pills is the same thing one level down.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl()
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [`${collectionsHref()}?`, `${collectionsHref()}/*?`],
    },
    sitemap: `${base}/sitemap.xml`,
  }
}
