import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CollectionFeed } from '@/components/collection-feed'
import { CollectionShelf } from '@/components/collection-shelf'
import { NavProgress } from '@/components/nav-progress'
import { CollectionSearch } from '@/components/collection-search'
import { CollectionTagBar } from '@/components/collection-tag-bar'
import { SiteHeader } from '@/components/site-header'
import { RestrictedNotice } from '@/components/restricted-notice'
import { SetupNotice } from '@/components/setup-notice'
import { isDatabaseConfigured } from '@/lib/db'
import { isNsfwEnabled } from '@/lib/nsfw-server'
import {
  COLLECTION_PAGE_SIZE,
  getCollection,
  listCollectionPosts,
  listCollections,
} from '@/lib/data/collections'
import { listCollectionTags } from '@/lib/data/collection-tags'
import {
  collectionHref,
  collectionsHref,
  type CollectionListFilter,
} from '@common/collections'
import { isRestricted, RATING_LABEL, tagLabel } from '@common/search'
import { SITE_NAME } from '@/config'

/**
 * The two pages a collection has, and the shape they share: the site header, a heading,
 * and a grid.
 *
 * **The shelf list is searched, and a shelf is filtered.** The list takes a name, a tier and
 * AI-or-not (`CollectionSearch`) — with every post on a shelf, it is how anything on the
 * site is found. Inside a shelf the narrowing is that shelf's own tags, drawn as pills
 * above its images (`CollectionTagBar`); a shelf with none has no bar.
 */

/** The shelf list — `/collections`, narrowed by its search. */
export async function CollectionListing({ filter }: { filter: CollectionListFilter }) {
  if (!isDatabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-4">
        <SiteHeader current="collections" />
        <div className="pt-4">
          <SetupNotice />
        </div>
      </div>
    )
  }

  const [collections, nsfw] = await Promise.all([listCollections(filter), isNsfwEnabled()])
  const filtered = Object.keys(filter).length > 0
  // The one empty answer that has a reason worth giving: the setting is the ceiling, and
  // asking for the tier above it finds nothing rather than reaching past it.
  const gated = filter.rating !== undefined && isRestricted(filter.rating) && !nsfw

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <SiteHeader current="collections" />
      <div className="flex items-baseline gap-2">
        <h1 className="text-lg font-bold tracking-tight">🗂️ Collections</h1>
        <span className="text-xs text-muted">
          {collections.length} collection{collections.length === 1 ? '' : 's'}
        </span>
      </div>
      <CollectionSearch filter={filter} />
      {gated ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {RATING_LABEL.r} collections are hidden.{' '}
          <Link href="/settings" className="text-accent hover:underline">
            Turn on NSFW in Settings
            <NavProgress />
          </Link>{' '}
          to see them.
        </p>
      ) : (
        <CollectionShelf collections={collections} filtered={filtered} />
      )}
    </div>
  )
}

/** One collection — `/collections/[id]`, narrowed to the images carrying every one of
 *  `tags`. */
export async function CollectionPage({ id, tags }: { id: string; tags: string[] }) {
  if (!isDatabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-4">
        <SiteHeader current="collections" />
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

  // The shelf's own rating, gated like a post's page: its URL is reachable without the
  // list that leaves it out, and the notice rather than a 404 is what a post does.
  if (isRestricted(collection.rating) && !(await isNsfwEnabled())) {
    return <RestrictedNotice />
  }

  const [{ posts, hasMore }, shelfTags] = await Promise.all([
    listCollectionPosts(collectionId, { perPage: COLLECTION_PAGE_SIZE, tags }),
    listCollectionTags(collectionId),
  ])

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <SiteHeader current="collections" />
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
        <h1 className="text-lg font-bold tracking-tight">
          {collection.mark && <span className="mr-1.5">{collection.mark}</span>}
          {collection.name}
        </h1>
        {collection.is_ai && (
          <span className="text-xs text-muted" aria-label="AI-generated">
            🤖 AI
          </span>
        )}
        <span className="text-xs text-muted">
          {collection.post_count} image{collection.post_count === 1 ? '' : 's'}
        </span>
      </div>

      <CollectionTagBar collectionId={collectionId} tags={shelfTags} active={tags} />

      {posts.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {tags.length === 0 ? (
            'Nothing in this collection.'
          ) : (
            <>
              No image here carries {tags.length === 1 ? 'that tag' : 'all of those tags'}.{' '}
              <Link href={collectionHref(collectionId)} className="text-accent hover:underline">
                Show everything
                <NavProgress />
              </Link>
            </>
          )}
        </p>
      ) : (
        // Keyed on the filter: the feed holds its chunks in state, and a navigation to the
        // same route with other pills lit keeps a client component mounted — so without a
        // new key the old filter's images would stay on screen above the new ones.
        <CollectionFeed
          key={tags.join(' ')}
          collectionId={collectionId}
          tags={tags}
          initialPosts={posts}
          hasMore={hasMore}
        />
      )}
    </div>
  )
}

/**
 * A collection's own metadata. The shelf is a page worth indexing — a fixed listing with
 * a name — where a search result is not, so a shelf narrowed by its tag pills is `noindex`
 * and canonical to the whole shelf, the way a search of the shelf list is.
 */
export async function collectionMetadata(id: string, tags: string[] = []): Promise<Metadata> {
  const collectionId = Number(id)
  if (!Number.isInteger(collectionId) || collectionId < 1) return { title: 'Collection not found' }
  if (!isDatabaseConfigured()) return { title: 'Collection' }

  const collection = await getCollection(collectionId)
  if (!collection) {
    return { title: 'Collection not found', robots: { index: false, follow: false } }
  }

  // Titled like nothing in particular, for the reason a restricted post's metadata is: an
  // unfurl is the reader who has not asked, and the name alone can say plenty.
  if (isRestricted(collection.rating)) {
    const hidden = !(await isNsfwEnabled())
    return {
      title: hidden ? 'Collection' : collection.name,
      alternates: { canonical: `${collectionsHref()}/${collection.id}` },
      robots: { index: false, follow: !hidden },
    }
  }

  const description = `${collection.post_count} image${
    collection.post_count === 1 ? '' : 's'
  } in ${collection.name}.`

  return {
    title: tags.length > 0 ? `${collection.name}: ${tags.map(tagLabel).join(', ')}` : collection.name,
    description,
    alternates: { canonical: `${collectionsHref()}/${collection.id}` },
    robots: tags.length > 0 ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url: `${collectionsHref()}/${collection.id}`,
      title: collection.name,
      description,
    },
  }
}
