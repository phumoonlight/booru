'use client'

import Link from 'next/link'
import { NavProgress } from '@/components/nav-progress'
import { removeBookmark, useBookmarks } from '@/lib/use-bookmarks'
import { searchHref, tagLabel } from '@/lib/search'

/** Relative and coarse — a bookmark is "where I was", and the hour it happened is noise. */
function ago(at: number): string {
  const days = Math.floor((Date.now() - at) / 86_400_000)
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

/**
 * The sidebar's list of resume points. Each row is a link back into the gallery at that
 * post — the same `?from=` URL anyone could type — carrying the search the bookmark was
 * made under, so following one restores the browse and not just the picture.
 *
 * Empty until the store hydrates, which is why there is no skeleton: bookmarks live in
 * this browser only, so a placeholder would be claiming knowledge the server can't have.
 */
export function BookmarkList() {
  const bookmarks = useBookmarks()

  if (bookmarks.length === 0) {
    return (
      <p className="text-sm text-muted">
        No bookmarks. Hover a post and press 📑 to mark where you stopped — opening it
        again picks the gallery up from there.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-1">
      {bookmarks.map((bookmark) => (
        <li key={bookmark.id} className="flex items-center gap-1">
          <Link
            href={searchHref(bookmark.query, bookmark.id)}
            className="flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded px-1 text-sm hover:text-accent"
          >
            <span className="truncate">
              🔖 #{bookmark.id}
              {bookmark.query && (
                <span className="text-muted"> · {tagLabel(bookmark.query)}</span>
              )}
            </span>
            <span className="text-xs text-muted">{ago(bookmark.at)}</span>
            <NavProgress />
          </Link>
          <button
            type="button"
            onClick={() => removeBookmark(bookmark.id)}
            title="Remove bookmark"
            aria-label={`Remove bookmark on post ${bookmark.id}`}
            className="flex min-h-11 min-w-11 items-center justify-center rounded text-sm text-muted hover:text-foreground"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  )
}
