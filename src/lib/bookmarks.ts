// Pure helpers for the bookmark list — no browser and no server, so the store, the
// badge and the sidebar all share one definition of what a bookmark is.

/**
 * A bookmark is a **cursor**, not a collection entry: it marks where you stopped so
 * the gallery can pick up from that post and keep going into older ones, instead of
 * making you scroll back from the top.
 *
 * That is why the search string travels with the id. Resuming `blue_hair` from post
 * #900 is a different journey from resuming the whole gallery there, and the id alone
 * can't tell them apart. Nothing about the *post* is stored — no md5, no rating — so a
 * re-rated or deleted post can never leave a stale card behind; the listing resolves
 * the cursor against the live gallery every time.
 */
export type Bookmark = {
  id: number
  /** The `?query=` that was in effect when it was marked. Empty means the whole gallery. */
  query: string
  /** Epoch ms, so the list reads newest-first without a second sort key. */
  at: number
}

export const BOOKMARK_STORAGE_KEY = 'bookmarks'

/**
 * Old cursors stop being useful long before they stop taking up room, and a sidebar
 * list nobody can scan is the same as no list. The newest this many survive a write.
 */
export const MAX_BOOKMARKS = 50

/** A stored blob is whatever a previous version wrote — validate every field. */
export function parseBookmarks(raw: string | null): Bookmark[] {
  if (!raw) return []

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(
        (entry): entry is Bookmark =>
          typeof entry === 'object' &&
          entry !== null &&
          Number.isInteger((entry as Bookmark).id) &&
          (entry as Bookmark).id > 0 &&
          typeof (entry as Bookmark).query === 'string' &&
          Number.isFinite((entry as Bookmark).at)
      )
      .slice(0, MAX_BOOKMARKS)
  } catch {
    // Hand-edited, half-written, or from something else entirely — treat as absent
    return []
  }
}

/** Marks a post, or unmarks it if it is already marked. Newest first, capped. */
export function toggleBookmark(current: Bookmark[], id: number, query: string): Bookmark[] {
  if (current.some((entry) => entry.id === id)) {
    return current.filter((entry) => entry.id !== id)
  }
  return [{ id, query: query.trim(), at: Date.now() }, ...current].slice(0, MAX_BOOKMARKS)
}

export function isBookmarked(current: Bookmark[], id: number): boolean {
  return current.some((entry) => entry.id === id)
}
