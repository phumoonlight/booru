import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPost, getPostNeighbours, getPostTags } from '@/lib/data/posts'
import { PostViewCounter } from '@/components/post-view-counter'
import { PostNav } from '@/components/post-nav'
import { StartHereLink } from '@/components/start-here'
import { isRestricted, ratingToken, RATING_COLOR, RATING_LABEL, searchHref } from '@common/search'
import { postImageUrl, thumbnailUrl } from '@common/storage'
import { GroupedTagList } from '@/components/tag-list'
import { isSupabaseConfigured } from '@/lib/env'
import { isNsfwEnabled } from '@/lib/nsfw-server'
import { SetupNotice } from '@/components/setup-notice'
import { RestrictedNotice } from '@/components/restricted-notice'
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

  // A blocked page describes nothing, and neither does its metadata. The tags were the
  // title and the thumbnail was the OpenGraph image, so a link to an explicit post
  // unfurled in a chat window as a picture of it and a list of what it shows — past a
  // gate the page itself now holds. Nothing fetching this carries the cookie, which is
  // the point: an unfurl is exactly the reader who has not asked.
  if (isRestricted(post.rating) && !(await isNsfwEnabled())) {
    return {
      title: `Post #${post.id}`,
      description: `Rated ${RATING_LABEL[post.rating]}. Turn on NSFW in Settings to see it.`,
      alternates: { canonical: `/posts/${post.id}` },
      robots: { index: false, follow: true },
    }
  }

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
      images: [{ url: thumbnailUrl(post.file_name), alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [thumbnailUrl(post.file_name)],
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

  // The listing has left the adult tiers out since the setting arrived, but a post's own
  // URL is reachable without going near the listing — a link, a bookmark, a fresh private
  // window. Nothing below this line runs for a blocked post: no tags are read, no
  // neighbours, and `PostViewCounter` never mounts, so a view is not counted for a page
  // that showed nothing.
  if (isRestricted(post.rating) && !(await isNsfwEnabled())) {
    return <RestrictedNotice postId={post.id} rating={post.rating} />
  }

  const [tags, { prevId, nextId }] = await Promise.all([
    getPostTags(postId),
    getPostNeighbours(postId),
  ])

  const fullSize = postImageUrl(post.file_name, post.file_ext)

  // `unoptimized` on purpose: the detail view shows the stored file byte-for-byte.
  // That file is either the upload itself or the AVIF the pipeline stored in its place,
  // so it already is the best version this site holds.
  // Running it through the Next optimizer would re-encode it at quality 75 and strip
  // animation — compression belongs to the thumbnail, which the grid uses instead.
  const image = (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      {/* The caps resolve against this column while width and height stay auto —
          whichever one binds scales the other with it, so the image can't be squashed. */}
      <Image
        src={fullSize}
        alt={`Post ${post.id}`}
        width={post.width}
        height={post.height}
        placeholder="blur"
        blurDataURL={BLUR_DATA_URL}
        priority
        unoptimized
        className="h-auto max-h-full w-auto max-w-full object-contain"
      />
    </div>
  )

  return (
    // Fixed to the viewport so the image can be sized against it. Taken out of the
    // flow, the root layout's <main> collapses and the document itself never scrolls —
    // only the sidebar does.
    <div className="fixed inset-0 flex flex-col lg:flex-row-reverse">
      <PostViewCounter postId={post.id} />

      {/* Image first on mobile, right column on desktop */}
      <div className="flex h-[55dvh] shrink-0 flex-col p-2 lg:h-auto lg:min-h-0 lg:flex-1">
        {image}
      </div>

      {/* The aside itself no longer scrolls — it is the frame. Its header sits outside
          the scroller below so the way back and the walk to the next post stay put
          however far down the tags and the manage panel go. */}
      <aside className="flex min-h-0 flex-1 flex-col border-border p-3 lg:flex-none lg:w-72 lg:border-r">
        {/* The top bar is gone from this page, so the sidebar's header carries both the
            way back and the walk through the post's neighbours */}
        <div className="flex shrink-0 items-center justify-between gap-2 pb-5">
          <Link href="/posts" className="text-lg font-bold tracking-tight hover:underline">
            {SITE_NAME}
          </Link>
          <div className="flex items-center gap-1">
            {/* Beside the walk to the neighbouring posts, because it answers the same
                question from the other side: this is where you stop walking and go back
                to the gallery, starting here. It is also the only way to set a cursor on
                a phone — the grid's badge needs a hover the device doesn't have. */}
            <StartHereLink postId={post.id} />
            <PostNav prevId={prevId} nextId={nextId} />
          </div>
        </div>

        {/* Negative margin plus matching padding puts the scrollbar on the aside's own
            edge rather than floating a gutter's width inside it */}
        <div className="-mr-3 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pb-25 pr-3">
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
                {/* The listing's rating facet is gone, so this is where a tier is picked
                    up: the same `rating:x` token the search bar takes, one click away
                    from the post that made you want it. */}
                <dd>
                  <Link
                    href={searchHref(ratingToken(post.rating))}
                    className={`hover:underline ${RATING_COLOR[post.rating]}`}
                  >
                    {RATING_LABEL[post.rating]}
                  </Link>
                </dd>
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

          {/* No edit panel. Rating, source and tags are changed in the desktop app,
              which is the only thing holding a key that can write them. */}
        </div>
      </aside>
    </div>
  )
}
