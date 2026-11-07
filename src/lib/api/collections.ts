import type { CollectionPost, LatestCollectionPost } from '@/lib/data/collections'

/**
 * The browser's half of `src/app/api/` — what a page asks for after it has been rendered.
 * Each throws on a failed response, so a feed's catch sees a dropped connection and a 500
 * alike.
 */
async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.url}: ${response.status}`)
  return response.json() as Promise<T>
}

export async function loadMoreCollectionPosts({
  collectionId,
  after,
  tags,
}: {
  collectionId: number
  after: number
  tags: string[]
}): Promise<{ posts: CollectionPost[]; hasMore: boolean }> {
  const search = new URLSearchParams({ after: String(after) })
  if (tags.length > 0) search.set('tags', tags.join(' '))
  return json(await fetch(`/api/collections/${collectionId}/posts?${search}`))
}

export async function loadMoreLatestPosts({
  after,
  loaded,
}: {
  after: number
  loaded: number
}): Promise<{ posts: LatestCollectionPost[]; hasMore: boolean }> {
  const search = new URLSearchParams({ after: String(after), loaded: String(loaded) })
  return json(await fetch(`/api/posts?${search}`))
}

export async function loadCollectionPostCount(): Promise<number | null> {
  return json(await fetch('/api/posts/count'))
}

/**
 * `keepalive`, so a view earned just before the tab navigates away still lands. Fire and
 * forget: the caller does not wait, so a dropped request is swallowed here rather than left
 * as an unhandled rejection — a view is a popularity signal, not something to retry.
 */
export async function recordCollectionPostView(postId: number): Promise<void> {
  await fetch(`/api/posts/${postId}/view`, { method: 'POST', keepalive: true }).catch(() => {})
}
