import type { Post } from '@/lib/data/posts'
import { PostCard } from '@/components/post-card'

// Every item is the same height; ratios survive because the width flexes
const ROW = 'flex flex-wrap gap-2'
const ITEM_HEIGHT = 'h-36 sm:h-44 lg:h-56'

export function PostGrid({ posts }: { posts: Post[] }) {
  return (
    <ul className={ROW}>
      {posts.map((post) => (
        <li key={post.id} className={ITEM_HEIGHT}>
          <PostCard post={post} />
        </li>
      ))}
    </ul>
  )
}

// Cycled so the placeholder row looks like the ragged widths of real thumbs
const SKELETON_WIDTHS = ['w-28', 'w-40', 'w-32', 'w-24', 'w-36']

export function PostGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <ul className={ROW}>
      {Array.from({ length: count }, (_, i) => (
        <li
          key={i}
          className={`animate-pulse bg-surface ${ITEM_HEIGHT} ${
            SKELETON_WIDTHS[i % SKELETON_WIDTHS.length]
          }`}
        />
      ))}
    </ul>
  )
}
