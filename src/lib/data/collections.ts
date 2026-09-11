import { cache } from 'react'
import { db } from '@/lib/db'
import { serving } from '@/lib/data/site'
import { visibleRatings } from '@/lib/nsfw-server'
import { COLLECTION_TABLES } from '@common/collections'
import * as read from '@common/data/collections'

/**
 * The website's collection reads: `@common/data/collections` bound to this host's pool,
 * this request's NSFW ceiling, and the maintenance gate.
 *
 * The gate is applied here rather than in the layout for the reason `lib/data/site.ts`
 * sets out at length — a layout decides what is *drawn* and does not stop the segment
 * underneath from running — so every function below opens with `serving()`, the same way
 * the post reads do.
 *
 * **The ceiling is applied here too, and in one place.** `visibleRatings()` reaches every
 * one of these, so a collection page cannot forget it and the feed's later chunks cannot
 * disagree with its first — which is the same arrangement `lib/data/search.ts` makes for
 * the galleries. The website is the only caller that has a ceiling at all: the desktop app
 * manages the whole shelf and passes none.
 */

export type { Collection, CollectionPost, CollectionPostPage } from '@common/data/collections'
export { COLLECTION_PAGE_SIZE } from '@common/data/collections'

/**
 * Every shelf worth drawing, most recently touched first.
 *
 * `hideEmpty` is what makes this list honest on a public page: a collection with nothing in
 * it, or one whose every image is behind the NSFW setting, would be a card with a name, no
 * picture and a count of zero — an invitation to click on nothing. The desktop app lists
 * them all, since a shelf you have just named is exactly the row you are looking for there.
 */
export const listCollections = cache(async () =>
  (await serving())
    ? read.listCollections(db(), { visibleRatings: await visibleRatings(), hideEmpty: true })
    : []
)

// Cached because the collection page and its `generateMetadata` both want the same row —
// the same reason `getPost` is, and the same failure if it were not: a closed board still
// reading a shelf to title a page nobody is being shown.
export const getCollection = cache(async (id: number) =>
  (await serving())
    ? read.getCollection(db(), id, { visibleRatings: await visibleRatings() })
    : null
)

export async function listCollectionPosts(
  collectionId: number,
  options: { after?: number; perPage?: number } = {}
) {
  if (!(await serving())) return { posts: [], hasMore: false }
  return read.listCollectionPosts(db(), collectionId, {
    ...options,
    visibleRatings: await visibleRatings(),
  })
}

export const getCollectionPost = cache(async (id: number) =>
  (await serving()) ? read.getCollectionPost(db(), id) : null
)

export async function collectionNeighbours(options: { id: number; collectionId: number }) {
  if (!(await serving())) return { prevId: null, nextId: null }
  return read.collectionNeighbours(db(), { ...options, visibleRatings: await visibleRatings() })
}

/**
 * Ids and dates for `sitemap.xml` — the shelves, not their contents.
 *
 * A collection page is one fixed listing with a name on it, which is a page worth
 * indexing; the images inside it are not, and there could be a great many of them. This is
 * the same call `/tags/[id]` makes for itself: the sample is indexed, the walk through it
 * is not. Restricted images are already left out of the count by the ceiling below, so a
 * shelf of them contributes nothing.
 *
 * **No `serving()` guard**, like `getSitemapPosts` and for the same reason: a crawler
 * reads this to decide whether to come back, and answering it with nothing during an hour
 * of maintenance is a way to be dropped from an index over something temporary.
 */
export async function getSitemapCollections() {
  try {
    return await read.listCollections(db(), { visibleRatings: undefined, hideEmpty: true })
  } catch (error) {
    // The one read in this file that swallows its failure, and the sitemap is why: it is
    // one document listing several kinds of page, so a section that cannot be read must
    // cost that section and not the whole file. This build prerenders it, so an
    // unguarded throw here is a *deployment* that fails over a pending migration — which
    // is a long way from what a missing shelf list is worth.
    console.error(
      'Could not list collections for the sitemap:',
      error instanceof Error ? error.message : error
    )
    return []
  }
}

/**
 * Adds one view to a collection image — the website's second write, and the same one.
 *
 * `booru_web` holds `update (view_count) on collection_posts` and no other grant on the
 * table, so a stray update to the rating is refused by the database rather than by this
 * function remembering not to make one. Nothing but an id reaches here.
 */
export async function incrementCollectionPostView(postId: number): Promise<void> {
  // An image nobody was shown was not viewed. The counter never mounts behind the notice,
  // so this is belt and braces — and it is a write, which is the thing worth being sure
  // about on a closed board.
  if (!(await serving())) return

  const sql = db()
  await sql`
    update ${sql(COLLECTION_TABLES.posts)}
       set view_count = view_count + 1
     where id = ${postId}`
}
