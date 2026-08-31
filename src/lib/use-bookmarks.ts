'use client'

import { useSyncExternalStore } from 'react'
import {
  BOOKMARK_STORAGE_KEY,
  parseBookmarks,
  toggleBookmark as toggle,
  type Bookmark,
} from '@/lib/bookmarks'

// A module-level store, like the rating-blur options: the badge on a card, the button
// on the post page and the sidebar list are three separate trees that have to agree on
// what is marked the moment any of them changes it.
let cached: Bookmark[] | null = null
const listeners = new Set<() => void>()

function read(): Bookmark[] {
  if (cached === null) {
    try {
      cached = parseBookmarks(window.localStorage.getItem(BOOKMARK_STORAGE_KEY))
    } catch {
      // Private mode / storage disabled: bookmarks work for this page and vanish with it
      cached = []
    }
  }
  return cached
}

function write(next: Bookmark[]) {
  cached = next
  try {
    window.localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(next))
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

// Stable reference: the server renders no bookmarks, and returning a fresh [] each
// time would spin useSyncExternalStore forever.
const NONE: Bookmark[] = []
const serverSnapshot = () => NONE

/**
 * The bookmark list for this browser. Empty on the server and for the first hydrating
 * render — bookmarks are local to a visitor, so nothing about them can be rendered
 * ahead of time. React swaps in the real list immediately after, which is why the badge
 * is styled to appear rather than to disappear.
 */
export function useBookmarks(): Bookmark[] {
  return useSyncExternalStore(subscribe, read, serverSnapshot)
}

export function toggleBookmark(id: number, query: string) {
  write(toggle(read(), id, query))
}

export function removeBookmark(id: number) {
  write(read().filter((entry) => entry.id !== id))
}
