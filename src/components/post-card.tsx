import Image from 'next/image'
import Link from 'next/link'
import type { Post } from '@/lib/data/posts'
import { thumbnailUrl } from '@/lib/storage'

// Grid is 2 cols at 375px and 6 at desktop, so a thumb is never wider than ~50vw
const GRID_SIZES = '(min-width: 1024px) 16vw, (min-width: 640px) 25vw, 50vw'

export function PostCard({ post }: { post: Post }) {
  return (
    <Link
      href={`/posts/${post.id}`}
      className="group relative block aspect-square overflow-hidden rounded-lg border border-border bg-surface"
    >
      <Image
        src={thumbnailUrl(post.md5)}
        alt={`Post ${post.id}`}
        fill
        sizes={GRID_SIZES}
        className="object-cover transition-opacity group-hover:opacity-85"
      />
    </Link>
  )
}
