import Link from 'next/link'
import { FacetActions } from '@/components/tag-list'
import { NavProgress } from '@/components/nav-progress'
import {
  RATING_COLOR,
  RATING_LABEL,
  RATINGS,
  ratingToken,
  searchHref,
  withTag,
  withoutTag,
  type Rating,
} from '@common/search'

/**
 * Rating facet: the whole scale, always, as a fixed set of filters. Tapping a label
 * replaces the query with just that rating, while the ➕/➖ add it to the current search
 * (`rating:x`) or exclude it (`-rating:x`).
 *
 * It carries no per-tier count. There was a `rating_counts` table behind one — a
 * denormalized row per tier that every post write had to remember to recount — and what
 * it bought was a number beside four fixed filters nobody was choosing between on the
 * strength of it. The tag facet keeps its counts, where the list is long and the number
 * is how you tell a useful tag from a stray one.
 */
export function RatingList({
  currentQuery = '',
  activeRatings = [],
  excludedRatings = [],
}: {
  currentQuery?: string
  activeRatings?: Rating[]
  excludedRatings?: Rating[]
}) {
  const rows = RATINGS.map((rating) => ({
    rating,
    active: activeRatings.includes(rating),
    excluded: excludedRatings.includes(rating),
  }))

  return (
    <ul className="flex flex-col gap-0.5">
      {rows.map(({ rating, active, excluded }) => {
        const token = ratingToken(rating)
        const label = RATING_LABEL[rating]
        return (
          <li key={rating} className="group flex items-center gap-1">
            <Link
              href={searchHref(token)}
              aria-label={`Search only ${label} posts`}
              className={`pointer-fine:min-h-7 min-h-9 flex-1 py-1 text-sm hover:underline ${RATING_COLOR[rating]} ${
                active ? 'font-semibold underline' : ''
              } ${excluded ? 'line-through opacity-60' : ''}`}
            >
              {label}
              <NavProgress />
            </Link>
            <FacetActions
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
