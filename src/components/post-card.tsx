import Image from 'next/image'
import Link from 'next/link'
import type { Post } from '@/lib/data/posts'
import { thumbnailUrl } from '@/lib/storage'
import { BLUR_DATA_URL } from '@/lib/blur'

// Rows are a fixed height and thumbs keep their ratio, so width is what varies
const GRID_SIZES = '(min-width: 1024px) 20vw, (min-width: 640px) 30vw, 50vw'

export function PostCard({ post }: { post: Post }) {
  return (
    // `data-rating` is what the blur CSS keys off; overflow keeps the blurred edges
    // from spilling past the thumb. See `lib/rating-blur.ts`.
    <Link
      href={`/posts/${post.id}`}
      data-rating={post.rating}
      className="group block h-full overflow-hidden bg-surface"
    >
      {/* Full aspect ratio, never cropped — the row height sets the scale */}
      <Image
        src={thumbnailUrl(post.md5)}
        alt={`Post ${post.id}`}
        width={post.width}
        height={post.height}
        sizes={GRID_SIZES}
        placeholder="blur"
        blurDataURL={BLUR_DATA_URL}
        className="h-full w-auto max-w-full object-contain transition-opacity group-hover:opacity-85"
      />
    </Link>
  )
}
