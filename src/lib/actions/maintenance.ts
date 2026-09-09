'use server'

import { forgetSiteState, siteState } from '@/lib/data/site'
import type { SiteState } from '@common/data/site'

/**
 * What the maintenance notice's Check status button runs: drop the ten-minute hold, ask
 * the board, and answer with what it said.
 *
 * An action rather than a route handler, for the reason `loadMorePosts` is one — the data
 * layer stays the only place a query is written. It takes no arguments and returns the
 * same state the layout renders from, so a visitor pressing it while the site is still
 * closed gets a fresh `updatedAt` and a fresh message rather than a page that looks
 * identical whether or not anything happened.
 *
 * `forgetSiteState()` only reaches the instance that serves this call, which is the
 * limitation of a module-level cache and not a bug this button can fix. It is why the
 * button reports the answer itself instead of only refreshing: a refresh could land on
 * another instance still inside its own ten minutes.
 */
export async function checkSiteState(): Promise<SiteState> {
  forgetSiteState()
  return siteState()
}
