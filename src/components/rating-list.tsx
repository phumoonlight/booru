import Link from 'next/link'
import type { Post } from '@/lib/data/posts'
import {
  RATING_LABEL,
  RATINGS,
  ratingToken,
  searchHref,
  withTag,
  withoutTag,
  type Rating,
} from '@/lib/search'

// Danbooru's traffic-light convention, tuned for the dark theme
export const RATING_COLOR: Record<Rating, string> = {
  general: 'text-[#35c64a]',
  e1: 'text-[#4fa3e3]',
  e2: 'text-[#ead084]',
  e3: 'text-[#ff8a8b]',
  e4: 'text-[#ff5d5f]',
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
  restrictedHidden = false,
}: {
  posts: Post[]
  currentQuery?: string
  activeRatings?: Rating[]
  excludedRatings?: Rating[]
  restrictedHidden?: boolean
}) {
  const rows = RATINGS.map((rating) => ({
    rating,
    count: posts.filter((post) => post.rating === rating).length,
    active: activeRatings.includes(rating),
    excluded: excludedRatings.includes(rating),
  })).filter((row) => row.count > 0 || row.active || row.excluded)

  if (rows.length === 0 && !restrictedHidden) {
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
                aria-label={
                  excluded
                    ? `Stop excluding ${RATING_LABEL[rating]}`
                    : `Exclude ${RATING_LABEL[rating]}`
                }
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
                aria-label={
                  active
                    ? `Clear the ${RATING_LABEL[rating]} filter`
                    : `Only ${RATING_LABEL[rating]} posts`
                }
                className={`min-h-9 flex-1 py-1 text-sm hover:underline ${
                  RATING_COLOR[rating]
                } ${active ? 'font-semibold underline' : ''}`}
              >
                {RATING_LABEL[rating]}
              </Link>
              <span className="text-xs tabular-nums text-muted">{count}</span>
            </li>
          )
        })}
      </ul>

      {restrictedHidden && (
        <p className="text-xs text-muted">
          E3 and E4 posts are hidden.{' '}
          <Link
            href={searchHref(withTag(currentQuery, ratingToken('e4')))}
            className="text-accent hover:underline"
          >
            Show E4
          </Link>
        </p>
      )}
    </div>
  )
}
