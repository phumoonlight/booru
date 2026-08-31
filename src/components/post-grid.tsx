import type { Post } from '@/lib/data/posts'
import { PostCard } from '@/components/post-card'
import { startOf } from '@/lib/search'

// Every item is the same height; ratios survive because the width flexes
const ROW = 'flex flex-wrap gap-2'
const ITEM_HEIGHT = 'h-60 sm:h-70 lg:h-80'

/** `query` rides along for the cards' 🔖 badge, which adds its cursor to whatever
    search is on screen. Parsed once here rather than per card. */
export function PostGrid({ posts, query = '' }: { posts: Post[]; query?: string }) {
  const start = startOf(query)

  return (
    <ul className={ROW}>
      {posts.map((post) => (
        <li key={post.id} className={ITEM_HEIGHT}>
          <PostCard post={post} query={query} active={post.id === start} />
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
