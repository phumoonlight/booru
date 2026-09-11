import type { Board } from '@common/board'
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

/**
 * A file per board. The grid you left open on the gallery and the grid you left open on
 * the AI board are two different screens, and one slot would have meant switching mode
 * twice to get back to what you were doing. The gallery keeps the name it has always had,
 * so the file already on disk is still read.
 */
function cacheFile(board: Board): string {
  return board === 'post' ? 'browse.json' : `browse.${board}.json`
}

/**
 * What was on screen, if it is still worth showing. A day-old grid is dropped rather than
 * served stale: unlike the tag index, nothing here degrades gracefully — a post edited or
 * deleted yesterday would be drawn as it was, and there is no autocomplete to lose by
 * asking the board again.
 */
export function readBrowseCache(board: Board = 'post'): BrowseCacheFile | null {
  const file = cacheFile(board)
  const parsed = readCache(file)
  if (!parsed) return null

  const { at, query, posts, hasMore } = parsed as Partial<BrowseCacheFile>
  if (typeof at !== 'number' || typeof query !== 'string') return null
  if (!Array.isArray(posts) || typeof hasMore !== 'boolean') return null
  if (!isFresh(at)) {
    dropCache(file)
    return null
  }
  return { at, query, posts, hasMore }
}

export function writeBrowseCache(cache: BrowseCacheFile, board: Board = 'post'): void {
  writeCache(cacheFile(board), cache)
}

/** Dropped by the grid's own 🔄, by a new search, and by an upload landing — the same
 *  three moments that drop the renderer's copy, because they are one cache in two places. */
export function clearBrowseCache(board: Board = 'post'): void {
  dropCache(cacheFile(board))
}
