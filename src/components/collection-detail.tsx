import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { CollectionNav } from '@/components/collection-nav'
import { CollectionViewCounter } from '@/components/collection-view-counter'
import { PostImage } from '@/components/post-image'
import { RestrictedNotice } from '@/components/restricted-notice'
import { SetupNotice } from '@/components/setup-notice'
import { isDatabaseConfigured } from '@/lib/db'
import { isNsfwEnabled } from '@/lib/nsfw-server'
import {
  collectionNeighbours,
  getCollection,
  getCollectionPost,
} from '@/lib/data/collections'
import { collectionHref, collectionPostHref } from '@common/collections'
import { collectionImageUrl, collectionThumbUrl } from '@/lib/images'
import { isRestricted, RATING_COLOR, RATING_LABEL, type Rating } from '@common/search'
import { SITE_NAME } from '@/config'

/**
 * One image from a collection.
 *
 * `PostDetail` with the two things a collection post does not have taken out: there are no
 * tags, so there is no tag list and no tag-derived title, and there is no search, so
 * nothing rides in a query string. What is left is the picture, the walk through its own
 * shelf, and the handful of facts about the file.
 *
 * The gates are the site's, unchanged. The adult tier renders `<RestrictedNotice />`
 * rather than the image — an image's own URL is reachable without going near a listing,
 * which is what a link or a bookmark is — and the metadata is gated with it, because an
 * unfurl is exactly the reader who has not asked.
 */

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Behind the setting on its own rating or its shelf's — a shelf's rating narrows what is on
 *  it and never lifts it. */
function isHidden(post: { rating: Rating }, collection: { rating: Rating } | null): boolean {
  return isRestricted(post.rating) || (collection !== null && isRestricted(collection.rating))
}

export async function collectionPostMetadata(id: string): Promise<Metadata> {
  const postId = Number(id)
  if (!Number.isInteger(postId) || postId < 1) return { title: 'Not found' }
  if (!isDatabaseConfigured()) return { title: 'Collection image' }

  const post = await getCollectionPost(postId)
  if (!post) return { title: 'Not found', robots: { index: false, follow: false } }

  const canonical = collectionPostHref(post.collection_id, post.id)
  const collection = await getCollection(post.collection_id)

  if (isHidden(post, collection) && !(await isNsfwEnabled())) {
    return {
      title: 'Collection image',
      description: 'Turn on NSFW in Settings to see it.',
      alternates: { canonical },
      robots: { index: false, follow: true },
    }
  }

  const title = collection ? `${collection.name} — #${post.id}` : `Collection image #${post.id}`
  const description = `${post.width}×${post.height} · rated ${RATING_LABEL[post.rating]}`

  return {
    title,
    description,
    alternates: { canonical },
    // The shelf pages are indexable; the images inside them are not. A collection is a set
    // somebody assembled, and the set is the thing worth finding — a page per image would
    // be an unbounded run of pages with no words on them, which is what a sitemap should
    // not be made of. The adult tier is out for the site's usual reason on top of that.
    robots: { index: false, follow: true },
    openGraph: {
      type: 'article',
      url: canonical,
      title,
      description,
      siteName: SITE_NAME,
      images: [{ url: collectionThumbUrl(post.file_name), alt: title }],
    },
  }
}

export async function CollectionDetail({ id }: { id: string }) {
  if (!isDatabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-5xl px-3 py-4">
        <SetupNotice />
      </div>
    )
  }

  const postId = Number(id)
  if (!Number.isInteger(postId) || postId < 1) notFound()

  const post = await getCollectionPost(postId)
  if (!post) notFound()

  // The shelf is read first, since its rating gates the image as well as its own. Nothing
  // below the gate runs for a blocked image: no neighbours, and the counter never mounts —
  // so a view is not counted for a page that showed nothing.
  const collection = await getCollection(post.collection_id)
  if (isHidden(post, collection) && !(await isNsfwEnabled())) {
    return <RestrictedNotice />
  }

  const { prevId, nextId } = await collectionNeighbours({
    id: post.id,
    collectionId: post.collection_id,
  })

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <CollectionViewCounter postId={post.id} />

      {/* Sticky, like the post page's: the picture is most of a screen and the walk to the
          next image is what you came back up for. The way back is the collection, not the
          gallery — this image has no existence outside its shelf. */}
      <header className="sticky top-0 z-10 -mx-3 flex items-center gap-2 border-b border-border bg-background/90 px-3 py-2 backdrop-blur">
        <Link
          href={collectionHref(post.collection_id)}
          className="min-w-0 truncate pr-1 text-lg font-bold tracking-tight hover:underline"
        >
          {collection?.mark && <span className="mr-1.5">{collection.mark}</span>}
          {collection?.name ?? 'Collection'}
        </Link>
        <CollectionNav
          collectionId={post.collection_id}
          prevId={prevId}
          nextId={nextId}
        />
      </header>

      <PostImage
        src={collectionImageUrl(post.file_name, post.file_ext)}
        alt=""
        width={post.width}
        height={post.height}
      />

      {/* Details only. There is no tag column to sit beside, so this is a narrow block
          under the picture rather than the post page's two columns. */}
      <section className="w-full max-w-sm">
        <h2 className="mb-2 text-sm font-semibold">Details</h2>
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">ID</dt>
            <dd>#{post.id}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Rating</dt>
            {/* Not a link. On a post the rating is a search you can run; here there is no
                search to run it in, so it is a fact about the file like the two below. */}
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
            <dt className="text-muted">Added</dt>
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
  )
}
