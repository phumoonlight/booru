import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { listTags } from '@common/data/shared'
import type { Tag } from '@common/tags'
import { boardClient } from './supabase'

/**
 * The board's tag index, kept on disk for a day.
 *
 * Autocomplete used to be a query per pause in typing — and three round trips at that,
 * back when the handler checked the session first, which was `auth.getUser()` plus a
 * profiles read before the tags query it actually wanted. Tagging a set of twenty images
 * is hundreds of those, all asking a question whose answer changes only when somebody
 * uploads. The session checks are gone with the login; the cache is what still makes it
 * one read instead of a hundred.
 *
 * So the index is read once and filtered here. A whole board of tags is a few hundred
 * kilobytes of names and counts — small enough to hold, small enough to write out — and
 * a prefix match over an array in memory is faster than the round trip was ever going to
 * be. The Tags screen is served from the same copy, so opening it after a restart is now
 * free too.
 *
 * On disk rather than in memory because a day-long life means nothing to a process that
 * is closed at teatime; in its own file rather than in `save.json` because that file is
 * settings, meant to be read and hand-edited, and this is derived data that can be thrown
 * away at any moment without losing anything.
 */

const CACHE_FILE = 'tag-cache.json'

/** A day, as asked for. Long enough to cover a session, short enough that a tag someone
 *  else added shows up without anyone having to know this cache exists. */
const TTL = 24 * 60 * 60 * 1000

/**
 * Far above any board this app is pointed at, and a limit rather than no limit because
 * `listTags` has to be given one. Hitting it exactly is treated as "there may be more",
 * and suggestions fall back to querying — see `cachedSuggestions`.
 */
const CACHE_LIMIT = 10000

/** What the Tags screen shows, unchanged: an index nobody scrolls past. */
export const TAG_INDEX_LIMIT = 500

type CacheFile = { at: number; tags: Tag[] }

/** The copy consulted on every keystroke. Reading the file that often would undo the
 *  point of having one. `undefined` means the file has not been looked at yet. */
let memory: CacheFile | null | undefined
/** One fill at a time, however many lookups arrive while it runs. */
let filling: Promise<CacheFile | null> | null = null

function cachePath(): string {
  return join(app.getPath('userData'), CACHE_FILE)
}

function readFile(): CacheFile | null {
  const file = cachePath()
  if (!existsSync(file)) return null
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (!parsed || typeof parsed !== 'object') return null
    const { at, tags } = parsed as Partial<CacheFile>
    // A cache that won't parse is a cache that isn't there. Nothing here is worth a
    // crash, and the fix is one read from the board.
    if (typeof at !== 'number' || !Array.isArray(tags)) return null
    return { at, tags }
  } catch {
    return null
  }
}

function writeFile(cache: CacheFile): void {
  try {
    const file = cachePath()
    mkdirSync(dirname(file), { recursive: true })
    // Not indented: nobody edits this by hand, and the whitespace would be most of it
    writeFileSync(file, JSON.stringify(cache), 'utf8')
  } catch (error) {
    // A cache that cannot be written still works for this run, which is most of its value
    console.error('Could not write the tag cache:', error instanceof Error ? error.message : error)
  }
}

/**
 * The index, read from the board if what we have is missing or a day old.
 *
 * An expired copy is kept and returned when the refill fails: tags from yesterday are a
 * far better answer to "what is this tag called" than no autocomplete at all, and the
 * next keystroke will try again.
 */
async function ensureTags(): Promise<CacheFile | null> {
  if (memory === undefined) memory = readFile()
  if (memory && Date.now() - memory.at < TTL) return memory
  if (filling) return filling

  filling = (async () => {
    const supabase = boardClient()
    // An unconfigured bundle has nothing to read with, and an empty cache would then be
    // written over a good one. The stale copy stands.
    if (!supabase) return memory ?? null

    try {
      const tags = await listTags(supabase, CACHE_LIMIT)
      // An empty board is a legitimate answer; an empty *reply* to a board that had tags
      // a minute ago is not, and overwriting on one is how a cache goes blank for a day.
      if (tags.length === 0 && memory && memory.tags.length > 0) return memory
      memory = { at: Date.now(), tags }
      writeFile(memory)
      return memory
    } catch {
      return memory ?? null
    } finally {
      filling = null
    }
  })()

  return filling
}

/**
 * Autocomplete, answered locally. Same rules the SQL used — a prefix match, most used
 * first, ties by name — so the list looks exactly as it did when every keystroke was a
 * query.
 *
 * `null` means "ask the board instead": either there is nothing cached yet, or the read
 * hit its ceiling and the tag being typed may be one of the ones that didn't fit.
 */
export async function cachedSuggestions(query: string, limit = 8): Promise<Tag[] | null> {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  const cache = await ensureTags()
  if (!cache || cache.tags.length === 0 || cache.tags.length >= CACHE_LIMIT) return null

  return cache.tags
    .filter((tag) => tag.name.startsWith(needle))
    .sort((a, b) => b.post_count - a.post_count || a.name.localeCompare(b.name))
    .slice(0, limit)
}

/** The Tags screen's list, from the same copy. `null` if there is nothing to serve. */
export async function cachedIndex(): Promise<Tag[] | null> {
  const cache = await ensureTags()
  // Already ordered by the read: most used first, ties by name
  return cache ? cache.tags.slice(0, TAG_INDEX_LIMIT) : null
}

/**
 * Drops it. Two callers: the button on the settings screen, for a cache that has somehow
 * gone wrong, and every finished upload — a post creates tags and moves counts, which is
 * the one moment this is certainly out of date.
 */
export function clearTagCache(): void {
  memory = null
  try {
    rmSync(cachePath(), { force: true })
  } catch {
    // Nothing to do about it, and the in-memory copy is gone either way
  }
}

/** What the settings screen shows: how much is held, and how old it is. */
export function tagCacheStatus(): { count: number; at: number | null } {
  if (memory === undefined) memory = readFile()
  return { count: memory?.tags.length ?? 0, at: memory?.at ?? null }
}
