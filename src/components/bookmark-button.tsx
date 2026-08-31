'use client'

import { isBookmarked } from '@/lib/bookmarks'
import { toggleBookmark, useBookmarks } from '@/lib/use-bookmarks'

/**
 * The badge over a thumbnail. Hidden until the card is hovered — and, on a touch
 * screen, not rendered at all: there a tap on the card means "open the post", so an
 * overlay competing for the same pixels would only ever be pressed by accident. The
 * post page carries the same control as a plain button, which is how a phone marks
 * where it stopped.
 *
 * Marked is the exception to the hover rule: a bookmark you cannot see in the grid
 * you are scrolling isn't doing its job, so once set it stays lit.
 */
export function BookmarkBadge({ postId, query }: { postId: number; query: string }) {
  const marked = isBookmarked(useBookmarks(), postId)

  return (
    <button
      type="button"
      // The card is a link to the post; this sits on top of it, so the click has to
      // stop there or bookmarking would also open a tab.
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        toggleBookmark(postId, query)
      }}
      aria-pressed={marked}
      title={marked ? 'Remove bookmark' : 'Bookmark — resume from here later'}
      aria-label={marked ? `Remove bookmark on post ${postId}` : `Bookmark post ${postId}`}
      className={`absolute right-1 top-1 z-10 hidden h-9 w-9 items-center justify-center rounded-lg bg-background/80 text-base backdrop-blur-sm transition-opacity [@media(hover:hover)]:flex ${
        marked
          ? 'opacity-100'
          : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100'
      }`}
    >
      <span aria-hidden>{marked ? '🔖' : '📑'}</span>
    </button>
  )
}

/**
 * The same toggle on the post page, where there is no hover to reveal anything and no
 * link underneath to fight with — so it says what it is.
 */
export function BookmarkButton({ postId, query = '' }: { postId: number; query?: string }) {
  const marked = isBookmarked(useBookmarks(), postId)

  return (
    <button
      type="button"
      onClick={() => toggleBookmark(postId, query)}
      aria-pressed={marked}
      title={marked ? 'Remove bookmark' : 'Bookmark — resume from here later'}
      className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-xl transition-opacity hover:opacity-80 ${
        marked ? '' : 'opacity-60'
      }`}
    >
      <span aria-hidden>{marked ? '🔖' : '📑'}</span>
      <span className="sr-only">{marked ? 'Remove bookmark' : 'Bookmark this post'}</span>
    </button>
  )
}
