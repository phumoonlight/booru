import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPost, getPostTags } from '@/lib/data/posts'
import { getSearchNeighbours } from '@/lib/data/search'
import { PostViewCounter } from '@/components/post-view-counter'
import { PostNav } from '@/components/post-nav'
import { StartHereLink } from '@/components/start-here'
import {
  isRestricted,
  ratingToken,
  readQuery,
  RATING_COLOR,
  RATING_LABEL,
  searchHref,
} from '@common/search'
import { postImageUrl, thumbnailUrl } from '@/lib/images'
import { PostImage } from '@/components/post-image'
import { GroupedTagList } from '@/components/tag-list'
import { isDatabaseConfigured } from '@/lib/db'
import { isNsfwEnabled } from '@/lib/nsfw-server'
import { SetupNotice } from '@/components/setup-notice'
import { RestrictedNotice } from '@/components/restricted-notice'
import { SITE_NAME } from '@/config'

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
  if (!isDatabaseConfigured()) return { title: `Post #${postId}` }

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

/**
 * A post is read *inside* a search. `?query=` is the same string the listing carries —
 * the grid's cards hand it over when they open — and it decides three things here: which
 * posts prev/next walks, where the wordmark goes back to, and what the box below it
 * already holds. Without it every post was an island: the arrows stepped through the
 * whole board however narrow the search that found it was, and the way back was the
 * unfiltered gallery.
 */
export default async function PostPage({ params, searchParams }: PageProps<'/posts/[id]'>) {
  if (!isDatabaseConfigured()) {
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
    return <RestrictedNotice />
  }

  const query = readQuery(await searchParams)

  const [tags, { prevId, nextId }] = await Promise.all([
    getPostTags(postId),
    // The walk is the search's, and the tiers are this browser's: with the adult ones
    // off, an arrow can no longer land on the notice saying they are off.
    getSearchNeighbours({ id: post.id, query }),
  ])

  const fullSize = postImageUrl(post.file_name, post.file_ext)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <PostViewCounter postId={post.id} />

      {/* The top bar is gone from this page, so this header carries the way back and the
          walk through the post's neighbours. Sticky, because the picture is most of a
          screen and the walk to the next post is the thing you came back up for — the
          listing's own header does not need to be, having nothing under it but more of
          what it already describes.

          **No search box.** Searching is what the listing is for, and a box here was a
          place to start a search on the page you land on when one is finished — typing in
          it left the post immediately, so it was the way back with an extra step. The
          search that found this post is still carried, in `?query=`: it is what the arrows
          walk and what the wordmark goes back to. */}
      <header className="sticky top-0 z-10 -mx-3 flex items-center gap-1 border-b border-border bg-background/90 px-3 py-2 backdrop-blur">
        {/* Back to the listing this post came from, not to the whole gallery */}
        <Link
          href={searchHref(query)}
          className="pr-1 text-lg font-bold tracking-tight hover:underline"
        >
          {SITE_NAME}
        </Link>
        {/* Beside the walk to the neighbouring posts, because it answers the same
            question from the other side: this is where you stop walking and go back to
            the gallery, starting here. It is also the only way to set a cursor on a
            phone — the grid's badge needs a hover the device doesn't have. */}
        <StartHereLink postId={post.id} query={query} />
        <PostNav prevId={prevId} nextId={nextId} query={query} />
      </header>

      {/* Centred and nothing else: the picture is the page, and a ground behind it would
          be a frame drawn around something that already has edges — including a rounded
          one, which crops four corners of the post to say what the post already says. */}
      <PostImage src={fullSize} alt={`Post ${post.id}`} width={post.width} height={post.height} />

      {/* What is said about the post, under it. Two columns from `lg` — the tags are a
          list that grows and the details are seven fixed lines, so giving each half the
          width would leave one of them mostly empty at every size. */}
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
        <section>
          <h2 className="mb-2 text-sm font-semibold">Tags</h2>
          {/* Chips rather than a column of rows: down a 288px sidebar one tag per line
              was the shape of the space it had, and across the page it is twenty lines
              spent saying what two of wrapped chips say. */}
          <GroupedTagList
            entries={tags.map((tag) => ({ tag, count: tag.post_count }))}
            empty="No tags on this post."
            headings="named"
            flow="pills"
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
                  up: the same `rating:x` token the search bar takes, one click away from
                  the post that made you want it. */}
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
      </div>

      {/* No edit panel. Rating, source and tags are changed in the desktop app, which is
          the only thing holding a key that can write them. */}
    </div>
  )
}
