import type { Metadata } from 'next'
import { MaintenanceNotice } from '@/components/maintenance-notice'
import { siteState } from '@/lib/data/site'

/**
 * The maintenance gate, and the only reason this group has a layout.
 *
 * It sits here rather than in a proxy (Next 16's `middleware.ts`) because the site has
 * none and adding one would put a database read on the edge runtime, in front of every
 * asset, to answer a question the page below is about to ask anyway. A layout is the
 * cheapest thing that wraps all six routes and it renders where the pool already is.
 *
 * `robots.txt` and `sitemap.xml` are outside it, deliberately: they are what a crawler
 * reads to decide whether to come back, and answering them with a notice — or not at all
 * — during an hour of maintenance is a way to be dropped from an index over something
 * temporary.
 *
 * Note that a page's own `generateMetadata` still runs while the gate is closed: metadata
 * is produced from the route, not from what the layout chose to render. That costs a post
 * page's read during maintenance and buys the `noindex` below being merged into whatever
 * the page said about itself.
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
