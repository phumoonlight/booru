'use server'

import {
  COLLECTION_PAGE_SIZE,
  incrementCollectionPostView,
  listCollectionPosts,
  listLatestCollectionPosts,
  type CollectionPost,
} from '@/lib/data/collections'
import { LATEST_POSTS_LIMIT } from '@/lib/latest-posts'

/**
 * What a page asks for after it has been rendered: the next chunk of a shelf or of
 * `/posts`, and the view an image just earned.
 *
 * Actions rather than route handlers, so the data layer stays the only query surface.
 */
export async function loadMoreCollectionPosts({
  collectionId,
  after,
}: {
  collectionId: number
  after: number
}): Promise<{ posts: CollectionPost[]; hasMore: boolean }> {
  // Both arrive from the browser, and both name rows. A cursor is only ever an integer;
  // nonsense produces an empty chunk rather than a guess.
  if (!Number.isInteger(collectionId) || collectionId <= 0) return { posts: [], hasMore: false }
  if (!Number.isInteger(after) || after <= 0) return { posts: [], hasMore: false }

  return listCollectionPosts(collectionId, { after, perPage: COLLECTION_PAGE_SIZE })
}

/**
 * The next chunk of `/posts`, older than `after`. `loaded` is how many the feed already
 * holds, and the chunk is cut to what is left under `LATEST_POSTS_LIMIT` — the feed stops
 * asking there, and this stops answering there for anything that is not the feed.
 */
export async function loadMoreLatestPosts({
  after,
  loaded,
}: {
  after: number
  loaded: number
}): Promise<{ posts: CollectionPost[]; hasMore: boolean }> {
  if (!Number.isInteger(after) || after <= 0) return { posts: [], hasMore: false }
  if (!Number.isInteger(loaded) || loaded < 0) return { posts: [], hasMore: false }

  const room = Math.min(COLLECTION_PAGE_SIZE, LATEST_POSTS_LIMIT - loaded)
  if (room <= 0) return { posts: [], hasMore: true }
  return listLatestCollectionPosts({ after, perPage: room })
}

/**
 * Adds one view to a collection image. The website's second write, and it is the same
 * write: one column, one grant, one statement.
 */
export async function recordCollectionPostView(postId: number) {
  if (!Number.isInteger(postId) || postId < 1) return
  await incrementCollectionPostView(postId)
}
