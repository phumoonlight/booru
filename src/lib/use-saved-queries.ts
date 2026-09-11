'use client'

import { useSyncExternalStore } from 'react'
import type { Board } from '@common/board'
import {
  addSaved,
  parseSavedQueries,
  savedQueriesKey,
  savedKey,
  updateSaved,
  type SavedQuery,
} from '@/lib/saved-queries'

// A module-level store rather than component state: more than one copy of the shelf can
// be mounted at once, and both have to agree the moment either one saves.
//
// **One store per board**, because a shelf is per board (`savedQueriesKey`). Keyed rather
// than duplicated, so the subscribe/read/write triple is written once — and the listeners
// are keyed too: a save on one board must not re-render the other board's shelf into
// claiming rows it does not hold.
const cached: Partial<Record<Board, SavedQuery[]>> = {}
const listeners: Partial<Record<Board, Set<() => void>>> = {}

function subscribersOf(board: Board): Set<() => void> {
  return (listeners[board] ??= new Set())
}

function read(board: Board): SavedQuery[] {
  if (cached[board] === undefined) {
    try {
      cached[board] = parseSavedQueries(window.localStorage.getItem(savedQueriesKey(board)))
    } catch {
      // Private mode / storage disabled: saving works for this page and vanishes with it
      cached[board] = []
    }
  }
  return cached[board] as SavedQuery[]
}

function write(board: Board, next: SavedQuery[]) {
  cached[board] = next
  try {
    window.localStorage.setItem(savedQueriesKey(board), JSON.stringify(next))
  } catch {
    // Nothing to do — the list holds until the tab is closed
  }
  for (const listener of subscribersOf(board)) listener()
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
export function useSavedQueries(board: Board = 'post'): SavedQuery[] {
  // Both closures are rebuilt whenever the board changes, which is what makes
  // `useSyncExternalStore` re-subscribe and re-read rather than keep the old board's list.
  return useSyncExternalStore(
    (listener) => {
      const set = subscribersOf(board)
      set.add(listener)
      return () => {
        set.delete(listener)
      }
    },
    () => read(board),
    serverSnapshot
  )
}

export function saveQuery(query: string, board: Board = 'post') {
  write(board, addSaved(read(board), query))
}

export function updateQuery(query: string, board: Board = 'post') {
  write(board, updateSaved(read(board), query))
}

export function removeQuery(query: string, board: Board = 'post') {
  const key = savedKey(query)
  write(
    board,
    read(board).filter((entry) => savedKey(entry.query) !== key)
  )
}
