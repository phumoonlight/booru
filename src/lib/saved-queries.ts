// Pure helpers for saved queries — no browser and no server, so the store, the sidebar
// and the search bar all share one definition of what a saved query is.

import { withoutStart } from '@/lib/search'

/**
 * A saved query is the listing's whole address: tags, rating metatags, and — when you
 * marked a spot — the `start:` cursor that says where to begin. One string, the same
 * one the search bar shows, so what is saved is what you can read and edit.
 *
 * Nothing about any post is stored. A re-rated or deleted post can't leave a stale card
 * behind, because the query is resolved against the live gallery every time it is run.
 */
export type SavedQuery = {
  query: string
  /** Epoch ms of the last save, so the list reads newest-first without a second key. */
  at: number
}

export const SAVED_QUERIES_KEY = 'saved_queries'

/**
 * Enough to be a shelf, few enough to scan. Saved queries are meant to be re-run, and a
 * list nobody reads to the bottom is the same as no list.
 */
export const MAX_SAVED_QUERIES = 50

/**
 * What makes two saved queries "the same one": everything except where it starts.
 * `blue_hair start:900` and `blue_hair start:1200` are one search at two moments, which
 * is why Save updates in place and only ➕ ever adds a row.
 */
export function savedKey(query: string): string {
  return withoutStart(query).trim().toLowerCase()
}

export function findSaved(saved: SavedQuery[], query: string): SavedQuery | undefined {
  const key = savedKey(query)
  return saved.find((entry) => savedKey(entry.query) === key)
}

/** A stored blob is whatever a previous version wrote — validate every field. */
export function parseSavedQueries(raw: string | null): SavedQuery[] {
  if (!raw) return []

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(
        (entry): entry is SavedQuery =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as SavedQuery).query === 'string' &&
          (entry as SavedQuery).query.trim().length > 0 &&
          Number.isFinite((entry as SavedQuery).at)
      )
      .slice(0, MAX_SAVED_QUERIES)
  } catch {
    // Hand-edited, half-written, or from something else entirely — treat as absent
    return []
  }
}

/** Adds a query as a new row. The caller has already established it isn't saved. */
export function addSaved(saved: SavedQuery[], query: string): SavedQuery[] {
  const trimmed = query.trim()
  if (!trimmed) return saved
  return [{ query: trimmed, at: Date.now() }, ...saved].slice(0, MAX_SAVED_QUERIES)
}

/** Writes the current query over the row it belongs to — in practice, moves its cursor. */
export function updateSaved(saved: SavedQuery[], query: string): SavedQuery[] {
  const key = savedKey(query)
  return saved.map((entry) =>
    savedKey(entry.query) === key ? { query: query.trim(), at: Date.now() } : entry
  )
}
