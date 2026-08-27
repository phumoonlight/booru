import type { Post } from '@/lib/data/posts'

const RATING_ORDER = ['general', 'sensitive', 'questionable', 'explicit'] as const

type Rating = (typeof RATING_ORDER)[number]

// Danbooru's traffic-light convention, tuned for the dark theme
const RATING_COLOR: Record<Rating, string> = {
  general: 'text-[#35c64a]',
  sensitive: 'text-[#4fa3e3]',
  questionable: 'text-[#ead084]',
  explicit: 'text-[#ff8a8b]',
}

/** Rating breakdown of the posts currently on screen, like the tag facet. */
export function RatingList({ posts }: { posts: Post[] }) {
  const rows = RATING_ORDER.map((rating) => ({
    rating,
    count: posts.filter((post) => post.rating === rating).length,
  })).filter((row) => row.count > 0)

  if (rows.length === 0) {
    return <p className="text-sm text-muted">No posts here.</p>
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {rows.map(({ rating, count }) => (
        <li key={rating} className="flex items-center gap-1">
          <span className={`min-h-9 flex-1 py-1 text-sm capitalize ${RATING_COLOR[rating]}`}>
            {rating}
          </span>
          <span className="text-xs tabular-nums text-muted">{count}</span>
        </li>
      ))}
    </ul>
  )
}
