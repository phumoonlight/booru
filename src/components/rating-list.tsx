import Link from 'next/link'
import type { Post } from '@/lib/data/posts'
import { RATINGS, ratingToken, searchHref, withTag, withoutTag, type Rating } from '@/lib/search'

// Danbooru's traffic-light convention, tuned for the dark theme
export const RATING_COLOR: Record<Rating, string> = {
  general: 'text-[#35c64a]',
  sensitive: 'text-[#4fa3e3]',
  questionable: 'text-[#ead084]',
  explicit: 'text-[#ff8a8b]',
}

/**
 * Rating facet: the breakdown of the posts on screen, each row filtering the search
 * down to that rating (`rating:x`) or excluding it (`-rating:x`), exactly like the
 * tag facet. Ratings already in the query stay listed even at count 0 so the filter
 * can always be undone.
 */
export function RatingList({
  posts,
  currentQuery = '',
  activeRatings = [],
  excludedRatings = [],
  explicitHidden = false,
}: {
  posts: Post[]
  currentQuery?: string
  activeRatings?: Rating[]
  excludedRatings?: Rating[]
  explicitHidden?: boolean
}) {
  const rows = RATINGS.map((rating) => ({
    rating,
    count: posts.filter((post) => post.rating === rating).length,
    active: activeRatings.includes(rating),
    excluded: excludedRatings.includes(rating),
  })).filter((row) => row.count > 0 || row.active || row.excluded)

  if (rows.length === 0 && !explicitHidden) {
    return <p className="text-sm text-muted">No posts here.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-0.5">
        {rows.map(({ rating, count, active, excluded }) => {
          const token = ratingToken(rating)
          return (
            <li key={rating} className="flex items-center gap-1">
              <Link
                href={searchHref(
                  excluded ? withoutTag(currentQuery, token) : withTag(currentQuery, token, 'exclude')
                )}
                aria-label={excluded ? `Stop excluding ${rating}` : `Exclude ${rating}`}
                className={`flex min-h-9 w-6 items-center justify-center text-sm hover:text-red-400 ${
                  excluded ? 'text-red-400' : 'text-muted'
                }`}
              >
                −
              </Link>
              <Link
                href={searchHref(
                  active ? withoutTag(currentQuery, token) : withTag(currentQuery, token)
                )}
                aria-label={active ? `Clear the ${rating} filter` : `Only ${rating} posts`}
                className={`min-h-9 flex-1 py-1 text-sm capitalize hover:underline ${
                  RATING_COLOR[rating]
                } ${active ? 'font-semibold underline' : ''}`}
              >
                {rating}
              </Link>
              <span className="text-xs tabular-nums text-muted">{count}</span>
            </li>
          )
        })}
      </ul>

      {explicitHidden && (
        <p className="text-xs text-muted">
          Explicit posts are hidden.{' '}
          <Link
            href={searchHref(withTag(currentQuery, ratingToken('explicit')))}
            className="text-accent hover:underline"
          >
            Show them
          </Link>
        </p>
      )}
    </div>
  )
}
