import 'server-only'
import { headers } from 'next/headers'
import { logReads } from '@/config'

/**
 * Who asked, for a read that is being investigated.
 *
 * `lib/data/*` is the only query surface, so a line written there answers "what is
 * hitting the board" without a log at every page. What it cannot answer on its own is
 * *which kind of request* ran it — the same function backs a full HTML render, a
 * client-side navigation, a router prefetch and a server action, and those are four very
 * different things to be paying for. Next tells them apart in the request headers, so
 * that is what this reads.
 *
 * Diagnostic, not permanent: `LOG_READS=off` silences it, and it is meant to come out
 * again once the traffic has a name.
 */

/** Trimmed so one line stays one line in a log viewer; the tail of a UA says little. */
const UA_MAX = 160

/**
 * `html` is a document request, `rsc` a client-side navigation, `prefetch` the router
 * reaching ahead of one, and `action` a server action — `loadMorePosts` or the tag
 * autocomplete, neither of which renders a page at all.
 */
function kindOf(h: Headers): string {
  if (h.get('next-action')) return 'action'
  if (h.get('next-router-prefetch')) return 'prefetch'
  if (h.get('rsc')) return 'rsc'
  return 'html'
}

/**
 * A `key=value` line, quoted only where a value can hold a space. Deliberately flat
 * rather than JSON: this is read by eye in a Vercel log, and grepped for one field.
 *
 * Never throws and never blocks the read it is describing. `headers()` is unavailable
 * outside a request — during ISR, for instance, which is how `sitemap.xml` runs — and a
 * log that took a page down would be worse than the traffic it was chasing.
 */
export async function logRead(what: string, detail: Record<string, unknown>): Promise<void> {
  if (!logReads()) return

  const fields = Object.entries(detail)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${typeof value === 'string' ? JSON.stringify(value) : value}`)

  try {
    const h = await headers()
    // `x-forwarded-for` is a chain; the client is the first entry. `x-matched-path` is
    // the route Next resolved, which a server action's own URL does not tell you —
    // `next-url` is the page it was called from and is the better answer when both exist.
    const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim()
    console.log(
      [
        what,
        ...fields,
        `kind=${kindOf(h)}`,
        `path=${JSON.stringify(h.get('next-url') ?? h.get('x-matched-path') ?? '?')}`,
        `ua=${JSON.stringify((h.get('user-agent') ?? '?').slice(0, UA_MAX))}`,
        ip ? `ip=${ip}` : '',
        h.get('referer') ? `ref=${JSON.stringify(h.get('referer'))}` : '',
      ]
        .filter(Boolean)
        .join(' ')
    )
  } catch {
    // No request to describe — log the read itself, which is still the useful half.
    console.log([what, ...fields, 'kind=none'].join(' '))
  }
}
