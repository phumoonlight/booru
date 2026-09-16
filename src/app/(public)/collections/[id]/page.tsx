import type { Metadata } from 'next'
import { CollectionPage, collectionMetadata } from '@/components/collection-listing'
import { readCollectionTags } from '@common/collections'

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<'/collections/[id]'>): Promise<Metadata> {
  return collectionMetadata((await params).id, readCollectionTags(await searchParams))
}

/** One collection's images, newest first, narrowed by whichever of its tag pills are lit. */
export default async function Page({ params, searchParams }: PageProps<'/collections/[id]'>) {
  return <CollectionPage id={(await params).id} tags={readCollectionTags(await searchParams)} />
}
