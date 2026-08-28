import Link from 'next/link'
import type { Post } from '@/lib/data/posts'
import { FacetActions } from '@/components/tag-list'
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
 * Rating facet: the breakdown of the posts on screen. Tapping a label replaces the whole
 * query with just that rating, while the hover-revealed ➕/➖ add it to the current search
 * (`rating:x`) or exclude it (`-rating:x`). Every rating is always listed, count 0
 * included, so the scale reads as a fixed set of filters rather than a list that shifts
 * with the results.
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
        const label = RATING_LABEL[rating]
        return (
          <li key={rating} className="group flex items-center gap-1">
            <Link
              href={searchHref(token)}
              aria-label={`Search only ${label} posts`}
              className={`min-h-9 flex-1 py-1 text-sm hover:underline ${RATING_COLOR[rating]} ${
                active ? 'font-semibold underline' : ''
              } ${excluded ? 'line-through opacity-60' : ''}`}
            >
              {label}
            </Link>
            <FacetActions
              count={count}
              plus={{
                href: searchHref(
                  active ? withoutTag(currentQuery, token) : withTag(currentQuery, token)
                ),
                label: active ? `Remove ${label} from the search` : `Add ${label} to the search`,
                on: active,
              }}
              minus={{
                href: searchHref(
                  excluded
                    ? withoutTag(currentQuery, token)
                    : withTag(currentQuery, token, 'exclude')
                ),
                label: excluded ? `Stop excluding ${label}` : `Exclude ${label}`,
                on: excluded,
              }}
            />
          </li>
        )
      })}
    </ul>
  )
}
