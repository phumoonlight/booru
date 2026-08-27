import Image from 'next/image'
import Link from 'next/link'
import type { Post } from '@/lib/data/posts'
import { thumbnailUrl } from '@/lib/storage'

// Rows are a fixed height and thumbs keep their ratio, so width is what varies
const GRID_SIZES = '(min-width: 1024px) 20vw, (min-width: 640px) 30vw, 50vw'

export function PostCard({ post }: { post: Post }) {
  return (
    <Link href={`/posts/${post.id}`} className="group block h-full bg-surface">
      {/* Full aspect ratio, never cropped — the row height sets the scale */}
      <Image
        src={thumbnailUrl(post.md5)}
        alt={`Post ${post.id}`}
        width={post.width}
        height={post.height}
        sizes={GRID_SIZES}
        className="h-full w-auto max-w-full object-contain transition-opacity group-hover:opacity-85"
      />
    </Link>
  )
}
