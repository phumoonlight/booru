import { useEffect, useState } from 'react'
import type { Tag } from '@common/tags'

/**
 * The board's names and categories, held once for every box on screen that searches them.
 *
 * Deliberately not the Tags screen's cache (`tag-index-store.ts`): that one is the grid's,
 * re-read by its own 🔄, and this one is dropped by the same press through
 * `invalidateTagNames()` — creating, renaming or deleting a tag being the only things that
 * change it.
 */
let index: Tag[] | null = null

let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function loadIndex(): Promise<void> {
  if (inflight) return inflight
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
 * place a tag can be created, renamed or deleted.
 */
export function invalidateTagNames(): void {
  index = null
  void loadIndex()
}

/**
 * The board's tags as names, categories, marks and sections. Exported because the tag rule
 * editor searches the same vocabulary: a rule may only name a tag the board has, which is
 * this list exactly.
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
