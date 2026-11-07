import type { SiteState } from '@common/data/site'

/** The maintenance notice's Check status: `POST /api/site/check`. */
export async function checkSiteState(): Promise<SiteState> {
  const response = await fetch('/api/site/check', { method: 'POST' })
  if (!response.ok) throw new Error(`/api/site/check: ${response.status}`)
  return response.json() as Promise<SiteState>
}
