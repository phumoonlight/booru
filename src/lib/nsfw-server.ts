import 'server-only'
import { cookies } from 'next/headers'
import type { Rating } from '@common/search'
import { NSFW_COOKIE, NSFW_COOKIE_VALUE, ratingsFor } from '@/lib/nsfw'

/**
 * The reading half of the NSFW preference — split from `lib/nsfw.ts` because the
 * checkbox that writes the cookie is a client component, and `next/headers` in its
 * import graph is a build error however unreachable the call is.
 */
export async function isNsfwEnabled(): Promise<boolean> {
  const store = await cookies()
  return store.get(NSFW_COOKIE)?.value === NSFW_COOKIE_VALUE
}

export async function visibleRatings(): Promise<readonly Rating[]> {
  return ratingsFor(await isNsfwEnabled())
}
