import type { Metadata } from 'next'
import { PostListing } from '@/components/post-listing'
import { GENERATIVE_BOARD } from '@/lib/generative'
import { BOARD } from '@common/board'
import { readQuery, searchHref } from '@common/search'
import { SITE_NAME } from '@/config'

const LABEL = BOARD.generative.label

export async function generateMetadata({
  searchParams,
}: PageProps<'/ai-posts'>): Promise<Metadata> {
  const query = readQuery(await searchParams)
  const title = query ? query : LABEL
  const description = query
    ? `Generated posts tagged ${query}.`
    : `Generated images on ${SITE_NAME}.`

  return {
    title,
    description,
    alternates: { canonical: searchHref(query, GENERATIVE_BOARD) },
    // **The whole board is `noindex`, not only its searches.** It sits behind a
    // preference a visitor has to switch on, and a section nobody has been offered is not
    // one to be arrived at from a search engine — the same reasoning that keeps the adult
    // tier out of the index, one level up. `follow`, so the links out of it still count.
    robots: { index: false, follow: true },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url: searchHref(query, GENERATIVE_BOARD),
      title,
      description,
    },
  }
}

/** The AI board's listing — `PostListing` over `generative_posts`. */
export default async function AiPostsPage({ searchParams }: PageProps<'/ai-posts'>) {
  return <PostListing query={readQuery(await searchParams)} board={GENERATIVE_BOARD} />
}
