'use client'

import { Analytics as VercelAnalytics, type BeforeSendEvent } from '@vercel/analytics/react'
import { SEARCH_PARAM } from '@common/search'

/**
 * Vercel Web Analytics stores the URL of every page view, and on this site the URL
 * *is* the search: `/posts?query=1girl rating:explicit start:900`. Sending that would
 * hand a third party what each visitor searched for, ratings included, beside the
 * city-level geolocation the same data point carries — so the param is dropped before
 * the event leaves the browser. What survives is the path, which is all the pageview
 * counts need. Which tags get searched is a question for the board's own tables, where
 * the answer is ours and is not a URL string.
 */
function redact(event: BeforeSendEvent) {
  try {
    const url = new URL(event.url)
    if (!url.searchParams.has(SEARCH_PARAM)) return event
    url.searchParams.delete(SEARCH_PARAM)
    return { ...event, url: url.toString() }
  } catch {
    // An unparseable URL is not worth guessing at — drop the event entirely
    return null
  }
}

export function Analytics() {
  return <VercelAnalytics beforeSend={redact} />
}
