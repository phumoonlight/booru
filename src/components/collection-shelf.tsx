import Image from 'next/image'
import Link from 'next/link'
import type { Collection } from '@/lib/data/collections'
import { NavProgress } from '@/components/nav-progress'
import { collectionThumbUrl } from '@/lib/images'
import { collectionHref } from '@common/collections'
import { BLUR_DATA_URL } from '@/lib/blur'

/**
 * The shelf of shelves — every collection as a card with its name and its cover, the way a
 * photo app draws an album.
 *
 * A square card and not a justified row. The gallery's grid is justified because the
 * *pictures* are what is being scanned and their shapes carry information; here the
 * picture is a label on a box, and a grid of even squares is what makes the names read as
 * one column of text you can run your eye down. It is the one place on this site where a
 * thumbnail is cropped, and that is deliberate for the same reason.
 *
 * **Ordered by when the collection was last touched**, which the query decides — a shelf
 * something was just added to, or one just renamed, is the one worth being at the top. The
 * card says nothing about that: a date on every tile is a column of numbers nobody reads,
 * and the ordering already says it.
 */
export function CollectionShelf({ collections }: { collections: Collection[] }) {
  if (collections.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
        No collections yet.
      </p>
    )
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {collections.map((collection) => (
        <li key={collection.id}>
          <CollectionCard collection={collection} />
        </li>
      ))}
    </ul>
  )
}

function CollectionCard({ collection }: { collection: Collection }) {
  return (
    <Link
      href={collectionHref(collection.id)}
      className="group block overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-accent"
    >
      {/* The cover is the newest image on the shelf, derived rather than stored — see
          `listCollections`. A shelf with nothing visible on it never reaches this page
          (`hideEmpty`), so the empty box below is only the very brief window between an
          image being deleted and the page being re-rendered. */}
      <div className="grid aspect-square place-items-center overflow-hidden bg-background">
        {collection.cover_file_name ? (
          <Image
            src={collectionThumbUrl(collection.cover_file_name)}
            alt=""
            width={384}
            height={384}
            unoptimized
            placeholder="blur"
            blurDataURL={BLUR_DATA_URL}
            className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
          />
        ) : (
          <span aria-hidden className="text-2xl opacity-40">
            🗂️
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5 px-2 py-2">
        {/* Two lines at most. A name is prose and can be long; three lines of it under a
            square makes the cards in a row different heights. */}
        <span className="line-clamp-2 text-sm font-semibold">
          {collection.mark && <span className="mr-1">{collection.mark}</span>}
          {collection.name}
        </span>
        <span className="text-xs text-muted">
          {collection.post_count} image{collection.post_count === 1 ? '' : 's'}
        </span>
      </div>
      <NavProgress />
    </Link>
  )
}
