import { cache } from 'react'
import { db, isDatabaseConfigured } from '@/lib/db'
import { readSiteState, SITE_UP, type SiteState } from '@common/data/site'

export type { SiteState } from '@common/data/site'

/**
 * Is the site closed, and for how long may that answer be reused.
 *
 * The asymmetry is the whole design. **A serving board is asked on every visit** — the
 * switch is only useful if flipping it takes effect at once, and a query per page view is
 * the price of that. **A closed board is asked at most once every ten minutes**, because
 * the notice is the same for everybody and a visitor refreshing it is the most likely
 * traffic a closed site gets: without the hold, the one thing that reaches the database
 * during maintenance would be the page saying the site is down.
 *
 * So only the "on" answer is held. There is no window to wait out for the site to come
 * back, either — the notice's Check status button drops the hold, which is what that
 * button is for.
 *
 * A module-level `let` rather than `use cache`, for the reason `lib/data/posts.ts` sets
 * out at length: `cacheComponents` is a site-wide opt-in this build has not made. What it
 * costs is that the hold belongs to one serverless instance, so a cold one queries — which
 * is the correct failure, since a stale copy of *this* answer is the only one worth
 * avoiding.
 */
const MAINTENANCE_TTL_MS = 10 * 60 * 1000

let held: { state: SiteState; until: number } | null = null

/**
 * `cache()` on top of the hold, so the layout's render and its `generateMetadata` — which
 * run as one request and both need the answer — do not each pay for it while the site is
 * up. Per request; the `let` above is what spans them.
 */
export const siteState = cache(async (): Promise<SiteState> => {
  // Same fallback as the pages': an unconfigured deployment renders `<SetupNotice />`,
  // and a maintenance gate in front of it would say the wrong thing about the right
  // problem.
  if (!isDatabaseConfigured()) return SITE_UP

  if (held && Date.now() < held.until) return held.state

  try {
    const state = await readSiteState(db())
    // Only the closed answer is worth keeping — see above.
    held = state.maintenance ? { state, until: Date.now() + MAINTENANCE_TTL_MS } : null
    return state
  } catch (error) {
    // The board is unreachable, which every page below this is about to discover for
    // itself in a way that describes the actual problem. Closing the site over it would
    // replace one honest failure with a notice claiming this was on purpose.
    console.error(
      'Could not read site_settings:',
      error instanceof Error ? error.message : error
    )
    return held?.state ?? SITE_UP
  }
})

/**
 * Drop the hold, so the next read asks the board. The notice's Check status button, and
 * nothing else — it is the manual half of a cache whose automatic half is ten minutes.
 */
export function forgetSiteState(): void {
  held = null
}

/**
 * Is the board answering reads at all — the guard every other function in `lib/data/`
 * opens with.
 *
 * **The gate has to be here rather than in the layout.** `(public)/layout.tsx` swaps
 * `children` for the notice, which decides what a visitor *sees* and nothing else: the
 * router renders route segments itself, so a layout that hides one does not stop it from
 * running (Next's own guidance on the same mistake made with an auth check —
 * `node_modules/next/dist/docs/01-app/02-guides/authentication.md`). A closed board was
 * therefore drawing the notice and running the whole listing underneath it, one search
 * and one facet read per request, which is exactly the work closing the site is meant to
 * stop. It is the reason that file's DAL advice exists, and `lib/data/*` already being
 * the only query surface is what makes one guard cover all eleven routes and the feed's
 * server action together.
 *
 * Cheap in both states: while the site is up this is the same `cache()`d read the layout
 * already made in this request, and while it is closed the ten-minute hold means it is
 * usually no query at all.
 *
 * `getSitemapPosts` is the deliberate exception and does not call this — `sitemap.xml`
 * and `robots.txt` sit outside the gate because they are what a crawler reads to decide
 * whether to come back.
 */
export async function serving(): Promise<boolean> {
  return !(await siteState()).maintenance
}
