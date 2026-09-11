import type { Metadata } from 'next'
import { CollectionListing } from '@/components/collection-listing'
import { collectionsHref } from '@common/collections'
import { SITE_NAME } from '@/config'

const DESCRIPTION =
  'Sets of images kept off the board — one-offs and niche work that no tag would describe well.'

export const metadata: Metadata = {
  title: 'Collections',
  description: DESCRIPTION,
  alternates: { canonical: collectionsHref() },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    url: collectionsHref(),
    title: 'Collections',
    description: DESCRIPTION,
  },
}

/**
 * The shelf of collections. A static `metadata` object rather than a `generateMetadata`,
 * because this page has no params — there is no query here, which is the whole point of
 * the section.
 */
export default function CollectionsPage() {
  return <CollectionListing />
}
