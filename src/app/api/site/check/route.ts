import { forgetSiteState, siteState } from '@/lib/data/site'
import { isSameOrigin } from '@/lib/same-origin'

/**
 * What the maintenance notice's Check status button asks: drop the ten-minute hold, ask
 * the board, and answer with what it said. A POST because it drops the hold.
 *
 * It returns the same state the layout renders from, so a visitor pressing it while the
 * site is still closed gets a fresh `updatedAt` and a fresh message rather than a page that
 * looks identical whether or not anything happened.
 *
 * `forgetSiteState()` only reaches the instance that serves this request, which is the
 * limitation of a module-level cache and not a bug this button can fix. It is why the
 * button reports the answer itself instead of only refreshing: a refresh could land on
 * another instance still inside its own ten minutes.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 })
  forgetSiteState()
  return Response.json(await siteState())
}
