import Image from 'next/image'
import Link from 'next/link'
import type { Post } from '@/lib/data/posts'
import { StartHereBadge } from '@/components/start-here'
import { thumbnailUrl } from '@common/storage'
import { BLUR_DATA_URL } from '@/lib/blur'

/** `query` is the search the card is being shown under — what the 🔖 badge adds its
    cursor to. `active` marks the post the listing already starts at. */
export function PostCard({
  post,
  query = '',
  active = false,
}: {
  post: Post
  query?: string
  active?: boolean
}) {
  return (
    // The wrapper exists so the badge can sit over the thumbnail: nesting one link
    // inside another is not a thing, so the two are siblings and the group/positioning
    // moved up here.
    <div className="group relative h-full">
      <StartHereBadge postId={post.id} query={query} active={active} />
      <Link
        href={`/posts/${post.id}`}
        // A new tab, because the grid is a feed now: following a post in place throws
        // away every chunk loaded below the fold, and coming back lands you at the top
        // of whichever page the URL had reached rather than on the thumbnail you left.
        target="_blank"
        rel="noopener"
        className="block h-full overflow-hidden bg-surface"
      >
        {/* Full aspect ratio, never cropped — the justified row sizes the <li>, and the box
            it hands down already carries the thumbnail's ratio */}
      {/*
        `unoptimized`, like the detail image and for the same reason: the thumbnail is
        already the optimizer's output. Upload built it as a 384px-tall AVIF sized for
        this grid, so the only thing Next could add is a second lossy pass — a costly
        one, because it scales the requested quality by 50/80 for AVIF, turning the
        default 75 into an AVIF quality of 47 at effort 3. That re-encode was what
        softened the grid while the stored file stayed sharp.

        Nothing is lost by skipping it. Next can't enlarge past the source either
        (`withoutEnlargement` in its optimizer), so the resize was a no-op at these
        sizes, and the format fallback it would have provided is moot — the detail
        image is served as stored AVIF already, so the site needs AVIF support
        regardless. `sizes` went with it: an unoptimized image has no srcset to pick from.

        `width`/`height` stay the *post's* dimensions — they only set the aspect ratio
        that reserves grid space, and the thumbnail keeps the post's ratio.
      */}
        <Image
          src={thumbnailUrl(post.file_name)}
          alt={`Post ${post.id}`}
          width={post.width}
          height={post.height}
          unoptimized
          placeholder="blur"
          blurDataURL={BLUR_DATA_URL}
          className="h-full w-full object-contain transition-opacity group-hover:opacity-90"
        />
      </Link>
    </div>
  )
}
