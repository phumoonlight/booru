import Link from 'next/link'
import { searchPosts, getTagsForPosts, FEED_CHUNK_SIZE } from '@/lib/data/search'
import { NavProgress } from '@/components/nav-progress'
import { PostFeed } from '@/components/post-feed'
import { SavedQueries } from '@/components/saved-queries'
import { SearchHeader } from '@/components/search-header'
import { TagDrawer } from '@/components/tag-drawer'
import { GroupedTagList } from '@/components/tag-list'
import { SetupNotice } from '@/components/setup-notice'
import { isDatabaseConfigured } from '@/lib/db'
import { isNsfwEnabled } from '@/lib/nsfw-server'
import { BOARD, type Board } from '@common/board'
import { isRestricted, parseSearchQuery, searchHref, splitQuery } from '@common/search'

/**
 * A listing, whichever board it is of.
 *
 * `/posts` and `/ai-posts` are the same page reading two tables — the same header, the
 * same drawer, the same shelf, the same feed — so this is that page once and the two
 * routes are the query string and the board. Keeping them as two files was the
 * alternative, and it is how the second one quietly stops getting the fix the first one
 * got; everything that actually differs between them is `@common/board`'s six strings.
 *
 * It is a component rather than a helper the routes call, because the routes have nothing
 * left to do: read the query, name the board, render this.
 */
export async function PostListing({ query, board = 'post' }: { query: string; board?: Board }) {
  if (!isDatabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-4">
        <SearchHeader query={query} board={board} />
        <div className="pt-4">
          <SetupNotice />
        </div>
      </div>
    )
  }

  const { posts, hasMore } = await searchPosts({ query, board })
  // Which tags the facet lists comes from the posts on screen; their counts are this
  // board's — a tag on four hundred generated images and two drawings is not one number.
  const tagEntries = await getTagsForPosts(
    posts.map((p) => p.id),
    board
  )
  const { include, exclude, ratings } = splitQuery(parseSearchQuery(query))
  // A rating this browser isn't listing can still be typed into the box. Nothing comes
  // back, and an empty grid is an honest but unhelpful answer on its own — the reason is
  // a setting, and the setting is one click away.
  const askedForHidden = !(await isNsfwEnabled()) && ratings.some(isRestricted)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <SearchHeader
        query={query}
        board={board}
        menu={
          <TagDrawer label={`Tags (${tagEntries.length})`}>
            <h2 className="mb-2 text-base font-semibold">Tags ({tagEntries.length})</h2>
            <GroupedTagList
              entries={tagEntries.slice(0, 50)}
              currentQuery={query}
              board={board}
            />
          </TagDrawer>
        }
      />

      {/* What is left of the row the drawer used to share: the one thing here about *you*
          rather than about what is on screen, and the way back into a browse you left.
          Its shelf is the board's own — a query saved here runs here. */}
      <SavedQueries currentQuery={query} board={board} />

      {/* The grid speaks for itself, so the heading is left for assistive tech only */}
      {/* No banner for a resumed cursor: `start:900` is a chip in the search bar
          like any other token, and tapping its ✕ is how you leave it behind. */}
      <h1 className="sr-only">
        {include.length === 0 && exclude.length === 0 && ratings.length === 0
          ? `All ${BOARD[board].label.toLowerCase()}`
          : `Matching ${[...include, ...ratings.map((r) => `rating:${r}`)].join(', ') || 'any'}${
              exclude.length ? ` without ${exclude.join(', ')}` : ''
            }`}
      </h1>

      {askedForHidden && (
        <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
          That search asks for a rating this browser isn&rsquo;t showing.{' '}
          <Link href="/settings" className="text-accent hover:underline">
            Enable NSFW in Settings
            <NavProgress />
          </Link>{' '}
          to include it.
        </p>
      )}

      {posts.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {query
            ? 'No posts match that search.'
            : 'No posts yet — the desktop app adds the first one.'}
        </p>
      ) : (
        <PostFeed
          // A new search is a new feed, not more of the old one: the key throws the
          // appended chunks away rather than letting them outlive their query. The board
          // is in it because the same query on the other board is a different feed.
          key={searchHref(query, board)}
          initialPosts={posts}
          query={query}
          board={board}
          hasMore={hasMore}
          perPage={FEED_CHUNK_SIZE}
          resumable
        />
      )}
    </div>
  )
}
