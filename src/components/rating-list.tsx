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
  e5: 'text-[#ff2e31]',
}

/**
 * Rating facet: the breakdown of the posts on screen, each row filtering the search
 * down to that rating (`rating:x`) or excluding it (`-rating:x`), exactly like the
 * tag facet. Every rating is always listed, count 0 included, so the scale reads as a
 * fixed set of filters rather than a list that shifts with the results.
 */
export function RatingList({
  posts,
  currentQuery = '',
  activeRatings = [],
  excludedRatings = [],
}: {
  posts: Post[]
  currentQuery?: string
  activeRatings?: Rating[]
  excludedRatings?: Rating[]
}) {
  const rows = RATINGS.map((rating) => ({
    rating,
    count: posts.filter((post) => post.rating === rating).length,
    active: activeRatings.includes(rating),
    excluded: excludedRatings.includes(rating),
  }))

  return (
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
  )
}
