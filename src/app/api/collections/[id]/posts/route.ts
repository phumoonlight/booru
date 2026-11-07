import type { NextRequest } from 'next/server'
import { COLLECTION_PAGE_SIZE, listCollectionPosts } from '@/lib/data/collections'
import { readCollectionTags } from '@common/collections'

const NONE = { posts: [], hasMore: false }

/**
 * A shelf's next chunk, older than `?after=`, narrowed by `?tags=a+b` — what
 * `collection-feed.tsx` asks for on the way down. The query lives in the data layer; this
 * only reads the request.
 */
export async function GET(request: NextRequest, ctx: RouteContext<'/api/collections/[id]/posts'>) {
  const { id } = await ctx.params
  const search = request.nextUrl.searchParams
  const collectionId = Number(id)
  const after = Number(search.get('after'))

  // Both arrive from the browser, and both name rows. A cursor is only ever an integer;
  // nonsense produces an empty chunk rather than a guess.
  if (!Number.isInteger(collectionId) || collectionId <= 0) return Response.json(NONE)
  if (!Number.isInteger(after) || after <= 0) return Response.json(NONE)

  // The tags go through the same reader the page's URL does — the same grammar and the
  // same cap — rather than being trusted as a list.
  const tags = readCollectionTags({ tags: search.get('tags') ?? '' })
  return Response.json(
    await listCollectionPosts(collectionId, { after, perPage: COLLECTION_PAGE_SIZE, tags }),
  )
}
