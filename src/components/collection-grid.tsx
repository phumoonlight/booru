import Image from 'next/image'
import Link from 'next/link'
import type { CollectionPost } from '@/lib/data/collections'
import { ROW, itemStyle } from '@/components/image-rows'
import { collectionThumbUrl } from '@/lib/images'
import { collectionPostHref } from '@common/collections'
import { BLUR_DATA_URL } from '@/lib/blur'

/**
 * Collection images in justified rows (`image-rows.tsx`) — one shelf's, or the newest
 * across every shelf on `/posts`. Each card is addressed inside its own collection, read
 * off the row, so the grid does not care which of the two it is drawing.
 *
 * No rating badge: an image has no rating of its own any more, and a grid showing a
 * restricted shelf's images is one where the setting is on.
 */
export function CollectionGrid({ posts }: { posts: CollectionPost[] }) {
  return (
    <ul className={ROW}>
      {posts.map((post) => (
        <li key={post.id} className="min-w-0" style={itemStyle(post.width, post.height)}>
          <div className="group relative h-full">
            <Link
              href={collectionPostHref(post.collection_id, post.id)}
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
