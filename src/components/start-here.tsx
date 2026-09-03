import Link from 'next/link'
import { NavProgress } from '@/components/nav-progress'
import { searchHref, startToken, withStart } from '@common/search'

/**
 * "Start here" — the badge over a thumbnail. It doesn't save anything: it rewrites the
 * listing to begin at this post, by adding `start:<id>` to the query. What that leaves
 * on screen is a URL you can read, a chip you can clear in the search bar, and — if you
 * want to come back to it tomorrow — something the sidebar's ➕ can save whole.
 *
 * A link rather than a button, so it works with no JS, opens in a tab on ⌘-click, and
 * shows the same pending bar every other navigation on the site does.
 *
 * Revealed on hover and, on a touch screen, not rendered at all: there a tap on the card
 * means "open the post", and an overlay fighting for the same pixels would only ever be
 * pressed by accident. Phones get the same control on the post page instead.
 */
export function StartHereBadge({
  postId,
  query,
  active,
}: {
  postId: number
  /** The listing's current query — the cursor replaces any start: already in it. */
  query: string
  /** This post is already where the listing starts. */
  active?: boolean
}) {
  return (
    <Link
      href={searchHref(withStart(query, postId))}
      title={active ? 'The listing starts here' : 'Start the listing here'}
      aria-label={`Start the listing at post ${postId}`}
      aria-current={active ? 'true' : undefined}
      className={`absolute right-1 top-1 z-10 hidden h-9 w-9 items-center justify-center rounded-lg bg-background/80 text-base backdrop-blur-sm transition-opacity [@media(hover:hover)]:flex ${
        active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
      }`}
    >
      <span aria-hidden>🔖</span>
      <NavProgress />
    </Link>
  )
}

/**
 * The same move from the post page, where there is no hover to reveal anything and no
 * card underneath to fight with — so it says what it is. It is also the only way in on a
 * phone, which is why it sits in the header beside the walk to the neighbouring posts.
 */
export function StartHereLink({ postId }: { postId: number }) {
  return (
    <Link
      href={searchHref(startToken(postId))}
      title="Browse the gallery from this post"
      className="flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-xl opacity-60 transition-opacity hover:opacity-100"
    >
      <span aria-hidden>🔖</span>
      <span className="sr-only">Browse the gallery from this post</span>
      <NavProgress />
    </Link>
  )
}
