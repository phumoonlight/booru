import type { Metadata } from 'next'
import { PostDetail, postMetadata } from '@/components/post-detail'
import { GENERATIVE_BOARD } from '@/lib/generative'
import { readQuery } from '@common/search'

export async function generateMetadata({ params }: PageProps<'/ai-posts/[id]'>): Promise<Metadata> {
  return postMetadata((await params).id, GENERATIVE_BOARD)
}

/** One generated post — `PostDetail` over `generative_posts`. */
export default async function AiPostPage({ params, searchParams }: PageProps<'/ai-posts/[id]'>) {
  const [{ id }, search] = await Promise.all([params, searchParams])
  return <PostDetail id={id} query={readQuery(search)} board={GENERATIVE_BOARD} />
}
