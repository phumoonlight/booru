import { listTags } from '@common/data/shared'
import type { Tag } from '@common/tags'
import { dropCache, isFresh, readCache, writeCache } from './app-cache'
import { boardDb } from './db'

/**
 * The board's tag index, kept on disk for a day.
 *
 * Autocomplete used to be a query per pause in typing, all asking a question whose answer
 * changes only when somebody edits the vocabulary. So the index is read once and served
 * from here: a whole board of tags is a few hundred kilobytes of names and categories —
 * small enough to hold, small enough to write out. The Tags screen is served from the same
 * copy, so opening it after a restart is free.
 *
 * On disk rather than in memory because a day-long life means nothing to a process that
 * is closed at teatime; in the `app-cache` folder rather than in `save.json` because that
 * file is settings, meant to be read and hand-edited, and this is derived data that can
 * be thrown away at any moment without losing anything. The folder and the day it is kept
 * for are `main/app-cache.ts`.
 *
 * It was one copy per board while a tag carried a count per board. Both counts went with
 * the posts they counted (0012), and the vocabulary was always one list.
 */

const CACHE_FILE = 'tags.json'

/**
 * Far above any board this app is pointed at, and a limit rather than no limit because
 * `listTags` has to be given one.
 */
const CACHE_LIMIT = 10000

/** What the Tags screen shows, unchanged: an index nobody scrolls past. */
export const TAG_INDEX_LIMIT = 500

type CacheFile = { at: number; tags: Tag[] }

/** The copy in memory. `undefined` means the file has not been looked at yet. */
let memory: CacheFile | null | undefined
/** One fill at a time, however many lookups arrive while it runs. */
let filling: Promise<CacheFile | null> | null = null

function readFile(): CacheFile | null {
  const parsed = readCache(CACHE_FILE)
  if (!parsed) return null

  const { at, tags } = parsed as Partial<CacheFile>
  if (typeof at !== 'number' || !Array.isArray(tags)) return null
  // A copy written before `mark` or `form_section_id` existed has no such key, and serving it
  // would draw every tag glyphless, or every one of them on no row, for up to a day with
  // nothing to explain it. A copy carrying a key this version no longer reads, like the old
  // `post_count`, is harmless the other way round.
  if (tags.length > 0 && !('mark' in tags[0] && 'form_section_id' in tags[0])) return null
  return { at, tags }
}

/**
 * The index, read from the board if what we have is missing or a day old.
 *
 * An expired copy is kept and returned when the refill fails: tags from yesterday are a
 * far better answer to "what is this tag called" than no list at all, and the next
 * lookup will try again.
 */
async function ensureTags(): Promise<CacheFile | null> {
  if (memory === undefined) memory = readFile()
  const held = memory
  if (held && isFresh(held.at)) return held
  if (filling) return filling

  const fill = (async () => {
    const db = boardDb()
    // An unconfigured bundle has nothing to read with, and an empty cache would then be
    // written over a good one. The stale copy stands.
    if (!db) return memory ?? null

    try {
      const tags = await listTags(db, CACHE_LIMIT)
      // An empty board is a legitimate answer; an empty *reply* to a board that had tags
      // a minute ago is not, and overwriting on one is how a cache goes blank for a day.
      const previous = memory
      if (tags.length === 0 && previous && previous.tags.length > 0) return previous
      const next = { at: Date.now(), tags }
      memory = next
      writeCache(CACHE_FILE, next)
      return next
    } catch {
      return memory ?? null
    } finally {
      filling = null
    }
  })()

  filling = fill
  return fill
}

/** The Tags screen's list, from the same copy. `null` if there is nothing to serve. */
export async function cachedIndex(): Promise<Tag[] | null> {
  const cache = await ensureTags()
  // Already ordered by the read: A–Z
  return cache ? cache.tags.slice(0, TAG_INDEX_LIMIT) : null
}

/**
 * Drops it. Two callers: the button on the settings screen, for a cache that has somehow
 * gone wrong, and every write that changes a tag *row* — creating, renaming,
 * recategorizing, re-sectioning, marking and deleting.
 */
export function clearTagCache(): void {
  memory = null
  dropCache(CACHE_FILE)
}

/** What the settings screen shows: how much is held, and how old it is. */
export function tagCacheStatus(): { count: number; at: number | null } {
  if (memory === undefined) memory = readFile()
  return { count: memory?.tags.length ?? 0, at: memory?.at ?? null }
}
