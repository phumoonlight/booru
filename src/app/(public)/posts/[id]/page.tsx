import Image from 'next/image'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPost, getPostNeighbours, getPostTags } from '@/lib/data/posts'
import { getCurrentProfile } from '@/lib/data/profiles'
import { ManagePost } from '@/components/manage-post'
import { PostViewCounter } from '@/components/post-view-counter'
import { PostNav } from '@/components/post-nav'
import { isRestricted, RATING_COLOR, RATING_LABEL } from '@/lib/search'
import { postImageUrl, thumbnailUrl } from '@/lib/storage'
import { GroupedTagList } from '@/components/tag-list'
import { SearchHeader } from '@/components/search-header'
import { isSupabaseConfigured } from '@/lib/env'
import { SetupNotice } from '@/components/setup-notice'
import { BLUR_DATA_URL } from '@/lib/blur'
import { SITE_NAME } from '@/lib/site'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export async function generateMetadata({ params }: PageProps<'/posts/[id]'>): Promise<Metadata> {
  const { id } = await params
  const postId = Number(id)
  if (!Number.isInteger(postId) || postId < 1) return { title: 'Post not found' }
  // Pre-runbook the page renders the setup notice, so don't try to read the DB
  if (!isSupabaseConfigured()) return { title: `Post #${postId}` }

  const post = await getPost(postId)
  if (!post) return { title: 'Post not found', robots: { index: false, follow: false } }

  const tags = await getPostTags(postId)
  const tagNames = tags.map((tag) => tag.name)
  const title =
    tagNames.length > 0 ? `${tagNames.slice(0, 6).join(' ')} — #${post.id}` : `Post #${post.id}`
  const description =
    tagNames.length > 0
      ? `${post.width}×${post.height} · rated ${RATING_LABEL[post.rating]} · tagged ${tagNames.join(', ')}`
      : `${post.width}×${post.height} · rated ${RATING_LABEL[post.rating]}`

  return {
    title,
    description,
    alternates: { canonical: `/posts/${post.id}` },
    // Adult tiers are shown on the site but kept out of search-engine results
    robots: isRestricted(post.rating) ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'article',
      url: `/posts/${post.id}`,
      title,
      description,
      siteName: SITE_NAME,
      // The thumbnail is the only derived image the schema guarantees exists
      images: [{ url: thumbnailUrl(post.md5), alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [thumbnailUrl(post.md5)],
    },
  }
}

export default async function PostPage({ params }: PageProps<'/posts/[id]'>) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-5xl px-3 py-4">
        <SetupNotice />
      </div>
    )
  }

  const { id } = await params
  const postId = Number(id)
  if (!Number.isInteger(postId) || postId < 1) notFound()

  const post = await getPost(postId)
  if (!post) notFound()

  const [tags, { prevId, nextId }, profile] = await Promise.all([
    getPostTags(postId),
    getPostNeighbours(postId),
    getCurrentProfile(),
  ])

  const canManage = profile !== null

  const fullSize = postImageUrl(post.md5, post.file_ext)

  // `unoptimized` on purpose: the detail view shows the stored file byte-for-byte.
  // That file is either the upload itself or a lossless AVIF of it, so it already is
  // the best available quality.
  // Running it through the Next optimizer would re-encode it at quality 75 and strip
  // animation — compression belongs to the thumbnail, which the grid uses instead.
  const image = (
    <a href={fullSize} target="_blank" rel="noreferrer" className="block">
      <Image
        src={fullSize}
        alt={`Post ${post.id}`}
        width={post.width}
        height={post.height}
        placeholder="blur"
        blurDataURL={BLUR_DATA_URL}
        priority
        unoptimized
        className="h-auto w-full"
      />
    </a>
  )

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-4">
      <SearchHeader />
      <PostViewCounter postId={post.id} />
      <PostNav prevId={prevId} nextId={nextId} />

      <div className="flex flex-col gap-5 pt-4 lg:flex-row-reverse lg:items-start">
        {/* Image first on mobile, right column on desktop */}
        <div className="lg:flex-1">{image}</div>

        <aside className="flex flex-col gap-5 lg:w-64 lg:shrink-0">
          <section>
            <h2 className="mb-2 text-sm font-semibold">Tags</h2>
            <GroupedTagList
              entries={tags.map((tag) => ({ tag, count: tag.post_count }))}
              empty="No tags on this post."
            />
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold">Details</h2>
            <dl className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">ID</dt>
                <dd>#{post.id}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Rating</dt>
                <dd className={RATING_COLOR[post.rating]}>{RATING_LABEL[post.rating]}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Size</dt>
                <dd>
                  {post.width}×{post.height} · {formatBytes(post.file_size)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Type</dt>
                <dd className="uppercase">{post.file_ext}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Views</dt>
                <dd>{post.view_count.toLocaleString('en-US')}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Posted</dt>
                <dd>
                  <time dateTime={post.created_at}>
                    {new Date(post.created_at).toISOString().slice(0, 10)}
                  </time>
                </dd>
              </div>
              {post.source_url && (
                <div className="flex flex-col gap-0.5">
                  <dt className="text-muted">Source</dt>
                  <dd className="min-w-0">
                    <a
                      href={post.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-accent hover:underline"
                    >
                      {post.source_url}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {canManage && (
            <ManagePost
              postId={post.id}
              initialTags={tags.map(({ name, category }) => ({ name, category }))}
              initialRating={post.rating}
              initialSourceUrl={post.source_url ?? ''}
            />
          )}
        </aside>
      </div>
    </div>
  )
}
