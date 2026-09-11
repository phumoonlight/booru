import Image from 'next/image'
import Link from 'next/link'
import type { CollectionPost } from '@/lib/data/collections'
import { ROW, itemStyle } from '@/components/post-grid'
import { collectionThumbUrl } from '@/lib/images'
import { collectionPostHref } from '@common/collections'
import { isRestricted, RATING_LABEL } from '@common/search'
import { BLUR_DATA_URL } from '@/lib/blur'

/**
 * A collection's images, in the gallery's justified rows.
 *
 * The layout is imported from `post-grid.tsx` rather than copied: the band, the cap and
 * the 2:1 ratio ceiling are one decision tied to `THUMB_MAX_HEIGHT`, and the thumbnails
 * here are the same 384px AVIFs the pipeline makes for a post. A second copy of those
 * numbers is how the two would drift apart the first time either is re-measured.
 *
 * What is not shared is the card, and only because of the href: a collection image is
 * addressed inside its collection, and it has no tags and no search to carry. That is two
 * differences too many for a `board` prop on `PostCard` and not nearly enough for a second
 * grid.
 */
export function CollectionGrid({
  posts,
  collectionId,
}: {
  posts: CollectionPost[]
  collectionId: number
}) {
  return (
    <ul className={ROW}>
      {posts.map((post) => (
        <li key={post.id} className="min-w-0" style={itemStyle(post.width, post.height)}>
          <div className="group relative h-full">
            {/* The adult tier says so on the thumbnail, as it does on a post card: a
                listing showing one is a listing where the setting is on, so this is a
                label and not a gate. */}
            {isRestricted(post.rating) && (
              <span className="pointer-events-none absolute left-1 top-1 z-10 rounded-lg bg-[#ff5d5f] px-1.5 py-0.5 text-xs font-bold text-white">
                {RATING_LABEL[post.rating]}
              </span>
            )}
            <Link
              href={collectionPostHref(collectionId, post.id)}
              // A new tab, for the gallery's reason: this is a feed, and following an
              // image in place throws away every chunk loaded below the fold.
              target="_blank"
              rel="noopener"
              className="block h-full overflow-hidden bg-surface"
            >
              {/* `unoptimized`, like everything else on this site: the stored thumbnail
                  already is the optimizer's output, and a second lossy pass is all Next
                  could add. */}
              <Image
                src={collectionThumbUrl(post.file_name)}
                alt=""
                width={post.width}
                height={post.height}
                unoptimized
                placeholder="blur"
                blurDataURL={BLUR_DATA_URL}
                className="h-full w-full object-contain transition-opacity group-hover:opacity-90"
              />
            </Link>
          </div>
        </li>
      ))}
    </ul>
  )
}
