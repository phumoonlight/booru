import type { Metadata } from 'next'
import { PostDetail, postMetadata } from '@/components/post-detail'
import { readQuery } from '@common/search'

export async function generateMetadata({ params }: PageProps<'/posts/[id]'>): Promise<Metadata> {
  return postMetadata((await params).id)
}

/**
 * One post from the gallery. The page is `PostDetail`, which `/ai-posts/[id]` renders
 * too: the walk, the way back, the tags and the details are the same on either board,
 * and only the table differs.
 */
export default async function PostPage({ params, searchParams }: PageProps<'/posts/[id]'>) {
  const [{ id }, search] = await Promise.all([params, searchParams])
  return <PostDetail id={id} query={readQuery(search)} />
}
