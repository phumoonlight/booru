import type { Metadata } from 'next'
import { PostListing } from '@/components/post-listing'
import { readQuery, searchHref } from '@common/search'
import { SITE_DESCRIPTION, SITE_NAME } from '@/config'

export async function generateMetadata({ searchParams }: PageProps<'/posts'>): Promise<Metadata> {
  const query = readQuery(await searchParams)

  // Tag combinations are unbounded, so only the plain listing is indexable — and a
  // query carrying a cursor is one visitor's slice of it, which is nobody else's page.
  const indexable = !query

  return {
    title: query ? query : 'Posts',
    description: query ? `Posts tagged ${query}.` : SITE_DESCRIPTION,
    alternates: { canonical: searchHref(query) },
    robots: indexable ? undefined : { index: false, follow: true },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url: searchHref(query),
      title: query ? query : 'Posts',
      description: query ? `Posts tagged ${query}.` : SITE_DESCRIPTION,
    },
  }
}

/**
 * The gallery. The page itself is `PostListing` — `/ai-posts` renders the same one over
 * the other table, and a listing that existed twice is a listing that gets fixed once.
 * What stays here is the route's own business: reading its query and titling itself.
 */
export default async function PostsPage({ searchParams }: PageProps<'/posts'>) {
  return <PostListing query={readQuery(await searchParams)} />
}
