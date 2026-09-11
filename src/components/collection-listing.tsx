import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CollectionFeed } from '@/components/collection-feed'
import { CollectionShelf } from '@/components/collection-shelf'
import { NavProgress } from '@/components/nav-progress'
import { SearchHeader } from '@/components/search-header'
import { SetupNotice } from '@/components/setup-notice'
import { isDatabaseConfigured } from '@/lib/db'
import {
  COLLECTION_PAGE_SIZE,
  getCollection,
  listCollectionPosts,
  listCollections,
} from '@/lib/data/collections'
import { collectionsHref } from '@common/collections'
import { SITE_NAME } from '@/config'

/**
 * The two pages a collection has, and the shape they share: the site header with the
 * search box taken off, a heading, and a grid.
 *
 * **No search box on either.** That is the feature, not an omission. A collection is a set
 * somebody assembled by hand out of work that does not belong under a tag; narrowing it
 * would mean the images carry tags, which is precisely what they do not. The header still
 * carries the nav, because every page needs the way out.
 */

/** The whole shelf — `/collections`. */
export async function CollectionListing() {
  if (!isDatabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-4">
        <SearchHeader showSearch={false} collections />
        <div className="pt-4">
          <SetupNotice />
        </div>
      </div>
    )
  }

  const collections = await listCollections()

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <SearchHeader showSearch={false} collections />
      <div className="flex items-baseline gap-2">
        <h1 className="text-lg font-bold tracking-tight">🗂️ Collections</h1>
        <span className="text-xs text-muted">
          {collections.length} collection{collections.length === 1 ? '' : 's'}
        </span>
      </div>
      {/* One line saying what this section is, because it is the only part of the site
          whose contents are not reachable from the gallery — somebody arriving here from
          the nav should not have to work out why these images are not in it. */}
      <p className="text-sm text-muted">
        Sets of images kept off the board — one-offs and niche work that no tag would
        describe well.
      </p>
      <CollectionShelf collections={collections} />
    </div>
  )
}

/** One collection — `/collections/[id]`. */
export async function CollectionPage({ id }: { id: string }) {
  if (!isDatabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-4">
        <SearchHeader showSearch={false} collections />
        <div className="pt-4">
          <SetupNotice />
        </div>
      </div>
    )
  }

  const collectionId = Number(id)
  if (!Number.isInteger(collectionId) || collectionId < 1) notFound()

  const collection = await getCollection(collectionId)
  if (!collection) notFound()

  const { posts, hasMore } = await listCollectionPosts(collectionId, {
    perPage: COLLECTION_PAGE_SIZE,
  })

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <SearchHeader showSearch={false} collections />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {/* The way back is the heading's sibling rather than an arrow in the corner:
            there is exactly one place up from here, and it is named. */}
        <Link
          href={collectionsHref()}
          className="text-sm text-muted hover:text-foreground hover:underline"
        >
          🗂️ Collections
          <NavProgress />
        </Link>
        <h1 className="text-lg font-bold tracking-tight">{collection.name}</h1>
        <span className="text-xs text-muted">
          {collection.post_count} image{collection.post_count === 1 ? '' : 's'}
        </span>
      </div>

      {posts.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          Nothing in this collection.
        </p>
      ) : (
        <CollectionFeed collectionId={collectionId} initialPosts={posts} hasMore={hasMore} />
      )}
    </div>
  )
}

/**
 * A collection's own metadata. The shelf is a page worth indexing — a fixed listing with
 * a name — where a search result is not, so there is no `noindex` here.
 */
export async function collectionMetadata(id: string): Promise<Metadata> {
  const collectionId = Number(id)
  if (!Number.isInteger(collectionId) || collectionId < 1) return { title: 'Collection not found' }
  if (!isDatabaseConfigured()) return { title: 'Collection' }

  const collection = await getCollection(collectionId)
  if (!collection) {
    return { title: 'Collection not found', robots: { index: false, follow: false } }
  }

  const description = `${collection.post_count} image${
    collection.post_count === 1 ? '' : 's'
  } in ${collection.name}.`

  return {
    title: collection.name,
    description,
    alternates: { canonical: `${collectionsHref()}/${collection.id}` },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url: `${collectionsHref()}/${collection.id}`,
      title: collection.name,
      description,
    },
  }
}
