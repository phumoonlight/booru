import { loadConfig } from './config'

/**
 * Drops URLs from Cloudflare's edge cache, for the one write that replaces a stored object
 * under a name already served: 🖼️ Rebuild thumbnail (`main/collection-thumbnail.ts`). Every
 * other object is named after the md5 of its bytes, so a new one is a new URL and there is
 * nothing to purge.
 *
 * Browsers are not reached by this. Thumbnails are sent `immutable` for a year, so a visitor
 * who already holds the old one keeps it until their own cache lets it go.
 *
 * Answers rather than throws, like the writes it follows: the caller has already written the
 * new file, and a purge that failed is something to say, not a reason to unsay that.
 */
export async function purgeCdnUrls(
  urls: string[]
): Promise<{ ok: true; purged: boolean } | { ok: false; error: string }> {
  const purge = loadConfig()?.purge
  // Not configured is not a failure: the build was allowed to go without it.
  if (!purge) return { ok: true, purged: false }

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(purge.zoneId)}/purge_cache`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${purge.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: urls }),
      }
    )
    const body = (await response.json().catch(() => null)) as {
      success?: boolean
      errors?: { message?: string }[]
    } | null
    if (response.ok && body?.success) return { ok: true, purged: true }

    const reason = body?.errors
      ?.map((error) => error.message)
      .filter(Boolean)
      .join('; ')
    return { ok: false, error: `Cloudflare refused the purge: ${reason || response.status}` }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Purge failed.' }
  }
}
