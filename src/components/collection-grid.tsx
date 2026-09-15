import Image from 'next/image'
import Link from 'next/link'
import type { CollectionPost } from '@/lib/data/collections'
import { ROW, itemStyle } from '@/components/image-rows'
import { collectionThumbUrl } from '@/lib/images'
import { collectionPostHref } from '@common/collections'
import { isRestricted, RATING_LABEL, type Rating } from '@common/search'
import { BLUR_DATA_URL } from '@/lib/blur'

/**
 * Collection images in justified rows (`image-rows.tsx`) — one shelf's, or the newest
 * across every shelf on `/posts`. Each card is addressed inside its own collection, read
 * off the row, so the grid does not care which of the two it is drawing.
 *
 * **Badges only where the shelf is not already on screen.** A row from `/posts` carries its
 * shelf's `rating` and `is_ai`, and a card in that mixed feed says R-18 in a red pill and
 * AI in a blue one. A shelf's own page reads rows without either, so its cards draw none:
 * the heading above them has already said it once for all of them.
 */
export function CollectionGrid({
  posts,
}: {
  posts: (CollectionPost & { rating?: Rating; is_ai?: boolean })[]
}) {
  return (
    <ul className={ROW}>
      {posts.map((post) => (
        <li key={post.id} className="min-w-0" style={itemStyle(post.width, post.height)}>
          <div className="group relative h-full">
            {(post.is_ai || (post.rating && isRestricted(post.rating))) && (
              <span className="pointer-events-none absolute left-1 top-1 z-10 flex gap-1">
                {post.rating && isRestricted(post.rating) && (
                  <span className="rounded-full bg-[#ff5d5f] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                    {RATING_LABEL[post.rating]}
                  </span>
                )}
                {post.is_ai && (
                  <span className="rounded-full bg-[#3b82f6] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                    AI
                  </span>
                )}
              </span>
            )}
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
