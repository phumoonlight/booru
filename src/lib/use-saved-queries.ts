'use client'

import { useSyncExternalStore } from 'react'
import {
  addSaved,
  parseSavedQueries,
  SAVED_QUERIES_KEY,
  savedKey,
  updateSaved,
  type SavedQuery,
} from '@/lib/saved-queries'

// A module-level store rather than component state: more than one copy of the shelf can
// be mounted at once, and both have to agree the moment either one saves.
let cached: SavedQuery[] | null = null
const listeners = new Set<() => void>()

function read(): SavedQuery[] {
  if (cached === null) {
    try {
      cached = parseSavedQueries(window.localStorage.getItem(SAVED_QUERIES_KEY))
    } catch {
      // Private mode / storage disabled: saving works for this page and vanishes with it
      cached = []
    }
  }
  return cached
}

function write(next: SavedQuery[]) {
  cached = next
  try {
    window.localStorage.setItem(SAVED_QUERIES_KEY, JSON.stringify(next))
  } catch {
    // Nothing to do — the list holds until the tab is closed
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Stable reference: the server has no saved queries, and a fresh [] each call would
// spin useSyncExternalStore forever.
const NONE: SavedQuery[] = []
const serverSnapshot = () => NONE

/**
 * This browser's saved queries. Empty on the server and for the first hydrating render —
 * they belong to a visitor, not to the page, so nothing about them can be rendered ahead
 * of time. React swaps in the real list immediately after.
 */
export function useSavedQueries(): SavedQuery[] {
  return useSyncExternalStore(subscribe, read, serverSnapshot)
}

export function saveQuery(query: string) {
  write(addSaved(read(), query))
}

export function updateQuery(query: string) {
  write(updateSaved(read(), query))
}

export function removeQuery(query: string) {
  const key = savedKey(query)
  write(read().filter((entry) => savedKey(entry.query) !== key))
}
