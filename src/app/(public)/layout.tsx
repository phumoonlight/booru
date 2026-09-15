import type { Metadata } from 'next'
import { MaintenanceNotice } from '@/components/maintenance-notice'
import { siteState } from '@/lib/data/site'

/**
 * What a closed site *shows*. What it stops *doing* is `serving()` in `lib/data/site.ts`,
 * and the two halves are separate on purpose.
 *
 * This one sits here rather than in a proxy (Next 16's `middleware.ts`) because the site
 * has none and adding one would put a database read on the edge runtime, in front of
 * every asset, to answer a question the page below is about to ask anyway. A layout is
 * the cheapest thing that wraps all eleven routes in the group and it renders where the pool
 * already is.
 *
 * **But a layout only chooses what is drawn.** Swapping `children` for the notice does
 * not stop the route segment underneath from running — the router renders segments
 * itself, which is why Next's own auth guidance says to put the check in the data layer
 * rather than here (`02-guides/authentication.md`). This file was the whole gate for a
 * while, and a closed board was drawing the notice while running the full listing behind
 * it: one search and one facet read per request, plus every image page's
 * `generateMetadata`, which is produced from the route and so never sees this decision at
 * all. The reads are guarded at their own end now; this stays for the visitor.
 *
 * `robots.txt` and `sitemap.xml` are outside it, deliberately: they are what a crawler
 * reads to decide whether to come back, and answering them with a notice — or not at all
 * — during an hour of maintenance is a way to be dropped from an index over something
 * temporary. `getSitemapPosts` is guarded nowhere for the same reason.
 */
export async function generateMetadata(): Promise<Metadata> {
  const state = await siteState()
  // A closed site is not a page anyone should be able to find later. The pages below set
  // their own titles and descriptions, and this merges into those rather than replacing
  // them — a `noindex` on a page that also says it is `/posts` is exactly right.
  return state.maintenance ? { robots: { index: false, follow: false } } : {}
}

export default async function PublicLayout({ children }: LayoutProps<'/'>) {
  const state = await siteState()
  if (!state.maintenance) return children

  // The whole site, replaced. Not a banner over a working gallery: there is no half-open
  // state to draw — the board is either being written to or it isn't.
  return <MaintenanceNotice state={state} />
}
