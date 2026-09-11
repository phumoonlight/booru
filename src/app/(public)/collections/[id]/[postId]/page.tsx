import type { Metadata } from 'next'
import { CollectionDetail, collectionPostMetadata } from '@/components/collection-detail'

export async function generateMetadata({
  params,
}: PageProps<'/collections/[id]/[postId]'>): Promise<Metadata> {
  return collectionPostMetadata((await params).postId)
}

/**
 * One image from a collection. The `[id]` segment is the shelf it is on — it is in the URL
 * because that is the context this page is read in, and the row carries it too, so the
 * page works from either. Nothing here reads the segment: `collection_id` on the row is
 * the authority, and a mismatched pair in a hand-typed URL resolves to the image's real
 * shelf rather than to a page that half agrees with itself.
 */
export default async function Page({ params }: PageProps<'/collections/[id]/[postId]'>) {
  return <CollectionDetail id={(await params).postId} />
}
