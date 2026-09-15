import Link from 'next/link'
import { NavProgress } from '@/components/nav-progress'
import {
  COLLECTION_FILTER_PARAMS,
  collectionsHref,
  type CollectionListFilter,
} from '@common/collections'
import { RATING_LABEL, RATING_NAME, RATINGS } from '@common/search'

const FIELD =
  'min-h-11 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent'

/**
 * The shelf list's search: a piece of the name, a tier, AI or not.
 *
 * **A plain GET form**, not a client component. Submitting it is a navigation to
 * `collectionsHref(filter)`, the page reads the same params back with
 * `readCollectionFilter`, and so a search is a URL — shareable, back-buttonable, and
 * working without JavaScript. Nothing here types as you go: a list of shelves is short
 * enough that one press to search is not the slow part.
 *
 * Every control is named from `COLLECTION_FILTER_PARAMS` and every option value is the
 * spelling `readCollectionFilter` accepts, so the form cannot write a URL the page ignores.
 * "Any" submits an empty value, which the reader drops.
 */
export function CollectionSearch({ filter }: { filter: CollectionListFilter }) {
  const filtered = Object.keys(filter).length > 0

  return (
    <form
      action={collectionsHref()}
      role="search"
      className="flex flex-wrap items-center gap-2"
    >
      <input
        type="search"
        name={COLLECTION_FILTER_PARAMS.name}
        defaultValue={filter.name ?? ''}
        aria-label="Collection name"
        placeholder="Ukiyo-e"
        className={`${FIELD} min-w-0 flex-1 basis-48`}
      />
      <select
        name={COLLECTION_FILTER_PARAMS.rating}
        defaultValue={filter.rating ? RATING_NAME[filter.rating] : ''}
        aria-label="Rating"
        className={FIELD}
      >
        <option value="">Any rating</option>
        {RATINGS.map((rating) => (
          <option key={rating} value={RATING_NAME[rating]}>
            {RATING_LABEL[rating]}
          </option>
        ))}
      </select>
      <select
        name={COLLECTION_FILTER_PARAMS.ai}
        defaultValue={filter.isAi === undefined ? '' : filter.isAi ? '1' : '0'}
        aria-label="Generative"
        className={FIELD}
      >
        <option value="">AI or not</option>
        <option value="0">Not AI</option>
        <option value="1">🤖 AI only</option>
      </select>
      <button
        type="submit"
        className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-surface px-4 text-sm transition-colors hover:border-accent"
      >
        <span aria-hidden>🔍</span> Search
      </button>
      {filtered && (
        <Link
          href={collectionsHref()}
          className="px-1 text-sm text-muted hover:text-foreground hover:underline"
        >
          Clear
          <NavProgress />
        </Link>
      )}
    </form>
  )
}
