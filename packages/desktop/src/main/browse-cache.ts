import { dropCache, isFresh, readCache, writeCache } from './app-cache'
import type { BrowseCacheFile } from '../shared/api'

/**
 * The browse grid, kept for a day beside the tag index (`main/app-cache.ts`).
 *
 * It was already remembered in the renderer — a module-level `let` that survives the view
 * being unmounted, so glancing at Settings and coming back did not re-run the search and
 * re-fetch every thumbnail. This is that same copy, one step further: closing the window
 * threw it away, and the first thing anyone does on opening this app is look at the same
 * rows they were looking at last night.
 *
 * The rows only — not the thumbnails, which are `data:` URLs and would be megabytes of
 * base64 for a screenful. They stay in memory on both sides of the bridge, and a restart
 * re-fetches them; the grid still paints its shape immediately, which is what the cache is
 * for.
 */

const CACHE_FILE = 'browse.json'

/**
 * What was on screen, if it is still worth showing. A day-old grid is dropped rather than
 * served stale: unlike the tag index, nothing here degrades gracefully — a post edited or
 * deleted yesterday would be drawn as it was, and there is no autocomplete to lose by
 * asking the board again.
 */
export function readBrowseCache(): BrowseCacheFile | null {
  const parsed = readCache(CACHE_FILE)
  if (!parsed) return null

  const { at, query, posts, hasMore } = parsed as Partial<BrowseCacheFile>
  if (typeof at !== 'number' || typeof query !== 'string') return null
  if (!Array.isArray(posts) || typeof hasMore !== 'boolean') return null
  if (!isFresh(at)) {
    dropCache(CACHE_FILE)
    return null
  }
  return { at, query, posts, hasMore }
}

export function writeBrowseCache(cache: BrowseCacheFile): void {
  writeCache(CACHE_FILE, cache)
}

/** Dropped by the grid's own 🔄, by a new search, and by an upload landing — the same
 *  three moments that drop the renderer's copy, because they are one cache in two places. */
export function clearBrowseCache(): void {
  dropCache(CACHE_FILE)
}
