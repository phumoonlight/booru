import { BOARDS, type Board } from '@common/board'
import { listTags } from '@common/data/shared'
import type { Tag } from '@common/tags'
import { dropCache, isFresh, readCache, writeCache } from './app-cache'
import { boardDb } from './db'

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
 * is closed at teatime; in the `app-cache` folder rather than in `save.json` because that
 * file is settings, meant to be read and hand-edited, and this is derived data that can
 * be thrown away at any moment without losing anything. The folder and the day it is kept
 * for are `main/app-cache.ts`, shared with the browse grid.
 *
 * **One copy per board**, and only because of the number. Names, categories, marks and
 * sections are one vocabulary across both boards — a tag means the same thing either side
 * — but `post_count` does not, and the count is what orders the index and what every
 * screen draws beside a name. Two counts on one row was the alternative: it reads every
 * tag's second count on every fill, to be used only when the mode is switched, and it puts
 * a shape in this file that `Tag` does not have anywhere else. A second file costs one
 * extra read the first time you tag on the other board, and nothing after that.
 */

/** The gallery keeps the name it has always had, so an existing cache is still read. */
function cacheFile(board: Board): string {
  return board === 'post' ? 'tags.json' : `tags.${board}.json`
}

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
 *  point of having one. `undefined` means that board's file has not been looked at yet. */
const memory: Partial<Record<Board, CacheFile | null>> = {}
/** One fill at a time per board, however many lookups arrive while it runs. */
const filling: Partial<Record<Board, Promise<CacheFile | null> | null>> = {}

function readFile(board: Board): CacheFile | null {
  const parsed = readCache(cacheFile(board))
  if (!parsed) return null

  const { at, tags } = parsed as Partial<CacheFile>
  if (typeof at !== 'number' || !Array.isArray(tags)) return null
  // A copy written before `mark` or `form_section_id` existed has no such key, and serving it
  // would draw every tag glyphless, or every one of them on its category's own row, for up
  // to a day with nothing to explain it. Both columns are on the row they belong to, so an
  // entry that never carried one is not a tag "with no mark" or "on no section" — it is a
  // cache from a different version of this file. A copy carrying a key this version no
  // longer reads, like the old `category2`, is harmless the other way round.
  if (tags.length > 0 && !('mark' in tags[0] && 'form_section_id' in tags[0])) return null
  return { at, tags }
}

/**
 * The index, read from the board if what we have is missing or a day old.
 *
 * An expired copy is kept and returned when the refill fails: tags from yesterday are a
 * far better answer to "what is this tag called" than no autocomplete at all, and the
 * next keystroke will try again.
 */
async function ensureTags(board: Board): Promise<CacheFile | null> {
  if (memory[board] === undefined) memory[board] = readFile(board)
  const held = memory[board]
  if (held && isFresh(held.at)) return held
  const inFlight = filling[board]
  if (inFlight) return inFlight

  const fill = (async () => {
    const db = boardDb()
    // An unconfigured bundle has nothing to read with, and an empty cache would then be
    // written over a good one. The stale copy stands.
    if (!db) return memory[board] ?? null

    try {
      const tags = await listTags(db, CACHE_LIMIT, board)
      // An empty board is a legitimate answer; an empty *reply* to a board that had tags
      // a minute ago is not, and overwriting on one is how a cache goes blank for a day.
      const previous = memory[board]
      if (tags.length === 0 && previous && previous.tags.length > 0) return previous
      const next = { at: Date.now(), tags }
      memory[board] = next
      writeCache(cacheFile(board), next)
      return next
    } catch {
      return memory[board] ?? null
    } finally {
      filling[board] = null
    }
  })()

  filling[board] = fill
  return fill
}

/**
 * Autocomplete, answered locally. Same rules the SQL used — a prefix match, most used
 * first, ties by name — so the list looks exactly as it did when every keystroke was a
 * query.
 *
 * `null` means "ask the board instead": either there is nothing cached yet, or the read
 * hit its ceiling and the tag being typed may be one of the ones that didn't fit.
 */
export async function cachedSuggestions(
  query: string,
  limit = 8,
  board: Board = 'post'
): Promise<Tag[] | null> {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  const cache = await ensureTags(board)
  if (!cache || cache.tags.length === 0 || cache.tags.length >= CACHE_LIMIT) return null

  return cache.tags
    .filter((tag) => tag.name.startsWith(needle))
    .sort((a, b) => b.post_count - a.post_count || a.name.localeCompare(b.name))
    .slice(0, limit)
}

/** The Tags screen's list, from the same copy. `null` if there is nothing to serve. */
export async function cachedIndex(board: Board = 'post'): Promise<Tag[] | null> {
  const cache = await ensureTags(board)
  // Already ordered by the read: most used first, ties by name
  return cache ? cache.tags.slice(0, TAG_INDEX_LIMIT) : null
}

/**
 * Adds `delta` to the counts of these tags, in place.
 *
 * This exists because dropping the whole index was the wrong answer to a finished upload,
 * and by far the most expensive thing this app did over and over. An upload moves
 * `post_count` and moves nothing else — no write path coins a tag any more
 * (`resolveTagIds` refuses a name the board has no row for), so a post cannot introduce a
 * name, a category, a mark or a section. Throwing away a few hundred rows of *those* to
 * learn a handful of numbers meant the next tag field or Tags screen re-read the entire
 * board, and with one image staged at a time that was one full read per upload.
 *
 * **The arithmetic is exact, so no query is needed.** The post is new — a duplicate is
 * refused at staging, before this — and its tag list is deduped on the way in, so every
 * tag on it gained exactly one post. That is the same number `syncTagPostCounts`
 * recomputed on the board, arrived at without asking.
 *
 * A name the cache does not hold is skipped rather than added: an entry with no category
 * or mark would be a tag drawn wrong everywhere this list is drawn, and a tag the cache
 * has never seen is one the next daily read will bring in properly.
 *
 * The `at` stamp is deliberately left alone. Patching counts does not make the copy any
 * newer about everything else, and touching it would postpone the daily read that is the
 * only thing catching a rename made from another install.
 */
export function bumpTagCounts(names: string[], delta: number, board: Board = 'post'): void {
  if (names.length === 0) return
  // The file may hold a copy nothing has asked for yet this session. Patching memory
  // alone would leave that one behind to be served, stale, for the rest of the day.
  //
  // Only this board's copy moves. The same tag's count on the other board did not change,
  // which is the whole reason the two are separate columns.
  if (memory[board] === undefined) memory[board] = readFile(board)
  const held = memory[board]
  if (!held) return

  const wanted = new Set(names)
  let touched = false
  for (const tag of held.tags) {
    if (!wanted.has(tag.name)) continue
    tag.post_count = Math.max(0, tag.post_count + delta)
    touched = true
  }
  if (!touched) return

  // Kept in the order the read established — most used first — so a tag that overtakes
  // another is in the right place for the autocomplete without a second sort on the way
  // out. `cachedSuggestions` sorts its own matches anyway; this is for `cachedIndex`,
  // which trusts the order and slices.
  held.tags.sort((a, b) => b.post_count - a.post_count || a.name.localeCompare(b.name))
  writeCache(cacheFile(board), held)
}

/**
 * Drops it. Two callers now: the button on the settings screen, for a cache that has
 * somehow gone wrong, and every write that changes a tag *row* — creating, renaming,
 * recategorizing, re-sectioning, marking, deleting, and applying one tag across another's
 * posts. A finished upload no longer calls this; it patches the counts instead, which is
 * all an upload can move — see `bumpTagCounts`.
 */
/**
 * Both boards, always. Every caller is a write that changed a tag *row* — a name, a
 * category, a mark, a section, or the row going away — and that is the vocabulary, which
 * both copies hold. A count is the only per-board thing in here, and a count is not what
 * drops this.
 */
export function clearTagCache(): void {
  for (const board of BOARDS) {
    memory[board] = null
    dropCache(cacheFile(board))
  }
}

/**
 * What the settings screen shows: how much is held, and how old it is. The gallery's copy,
 * because that is the one every install has — the screen is answering "is there a cache,
 * and is it stale", and a second row for a board this machine may never have tagged on
 * would read as a problem rather than as an answer.
 */
export function tagCacheStatus(): { count: number; at: number | null } {
  if (memory.post === undefined) memory.post = readFile('post')
  const held = memory.post
  return { count: held?.tags.length ?? 0, at: held?.at ?? null }
}
