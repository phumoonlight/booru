import { useEffect, useState } from 'react'
import type { Tag } from '@common/tags'

/**
 * The board's names and categories, held once for every field on screen. A staged queue
 * of twenty cards is twenty of these components, and each asking the bridge for the same
 * few hundred kilobytes would be twenty identical round trips.
 *
 * Deliberately not the Tags screen's cache (`tag-index.tsx`). That one carries
 * `post_count` and has to be dropped whenever a post is saved, because saving moves
 * counts. This one holds names and categories, which no post write can change — only
 * creating, renaming or deleting a tag can, and coining one from the picker is the only
 * one of those that can happen from here.
 */
let index: Tag[] | null = null

let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function loadIndex(): Promise<void> {
  if (inflight) return inflight
  // No board. This copy holds names, categories, marks and sections and no count, and
  // those are one vocabulary across both boards — which is the whole reason the two share
  // a `tags` table. Only the Tags grid's copy is per board, because that one draws and
  // sorts by `post_count`.
  inflight = window.api
    .listTags()
    .catch(() => [] as Tag[])
    .then((tags) => {
      index = tags
      inflight = null
      for (const listener of listeners) listener()
    })
  return inflight
}

/**
 * Drops the shared copy and reads again. Called from the Tags screen, which is the only
 * place a tag can now be created, renamed or deleted — nothing on the tagging screens can
 * change this list any more, and a post save cannot: it moves `post_count`, which this
 * cache does not carry.
 */
export function invalidateTagNames(): void {
  index = null
  void loadIndex()
}

/**
 * The board's tags as names, categories, marks and sections — no counts, and so one list
 * whichever board the window is on. Exported because the tag rule editor searches the same
 * vocabulary: a rule may only name a tag the board has, which is this list exactly.
 */
export function useTagNames(): Tag[] | null {
  const [, bump] = useState(0)

  useEffect(() => {
    const listener = () => bump((n) => n + 1)
    listeners.add(listener)
    if (index === null) void loadIndex()
    return () => {
      listeners.delete(listener)
    }
  }, [])

  return index
}
