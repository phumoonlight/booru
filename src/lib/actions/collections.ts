'use server'

import { COLLECTION_PAGE_SIZE, listCollectionPosts } from '@/lib/data/collections'
import { incrementCollectionPostView } from '@/lib/data/collections'
import type { CollectionPost } from '@/lib/data/collections'

/**
 * The two things a collection page asks for after it has been rendered: the next chunk of
 * a shelf, and the view it just earned.
 *
 * Actions rather than route handlers, for the reason `loadMorePosts` is one — the data
 * layer stays the only query surface, and a second caller (the desktop app browses
 * collections too) reuses the function rather than the endpoint.
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
 * Adds one view to a collection image. The website's second write, and it is the same
 * write: one column, one grant, one statement.
 */
export async function recordCollectionPostView(postId: number) {
  if (!Number.isInteger(postId) || postId < 1) return
  await incrementCollectionPostView(postId)
}
