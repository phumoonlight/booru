import type { Metadata } from 'next'
import { CollectionListing } from '@/components/collection-listing'
import { collectionsHref, readCollectionFilter } from '@common/collections'
import { SITE_NAME } from '@/config'

const DESCRIPTION = 'Every collection on the board — find one by name, rating or AI.'

export async function generateMetadata({
  searchParams,
}: PageProps<'/collections'>): Promise<Metadata> {
  const filter = readCollectionFilter(await searchParams)
  // A search of the shelf list is one visitor's slice of a page that is already indexed
  // whole, so only the plain list is worth a crawler's time.
  const filtered = Object.keys(filter).length > 0

  return {
    title: filter.name ? `Collections: ${filter.name}` : 'Collections',
    description: DESCRIPTION,
    alternates: { canonical: collectionsHref() },
    robots: filtered ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url: collectionsHref(),
      title: 'Collections',
      description: DESCRIPTION,
    },
  }
}

/** The shelf list, and since the boards were dropped (0012) the way anything is found. */
export default async function CollectionsPage({ searchParams }: PageProps<'/collections'>) {
  return <CollectionListing filter={readCollectionFilter(await searchParams)} />
}
