import { BOARDS, type Board } from '@common/board'
import { currentBoard } from '../board-store'
import type { Post } from '@common/data/posts'

/**
 * What Browse remembers when it is not on screen: the query each board was looking at,
 * the rows it found, and the file both are written out to.
 *
 * All of it is module-level rather than React state because the view is unmounted whenever
 * another is in front of it — see each piece for the half of that argument it carries.
 */

/** What the last visit to each board was looking at. The view unmounts when another is in
 *  front of it, and coming back to an empty box after finding a post is a search typed
 *  twice. It outlives the window too, coming back with the stored grid below — the same
 *  argument one day further out, since the app is closed far more often than this view is. */
export const lastQuery: Record<Board, string> = { post: '', generative: '' }

/**
 * Points the next mount of Browse at a query, without being Browse.
 *
 * The Tags screen's "posts tagged this" goes through here: it is the same trick
 * `lastQuery` already is, used deliberately rather than as a convenience, and it works
 * because this view is mounted fresh every time it is switched to and reads `lastQuery`
 * on the way up. The grid cache is left alone — the seed check below already refuses a
 * cache held for a different query, and keeps one held for this exact query, which is the
 * right answer both ways.
 */
export function browseFor(query: string, board: Board = currentBoard()): void {
  lastQuery[board] = query
}

/**
 * And what it was looking *at*: the rows already read for `lastQuery`, chunks from Load
 * more included. Same reasoning as the box, one step further — this screen is unmounted
 * whenever another view is in front of it, so opening Settings and coming back used to
 * re-run the search and re-fetch every thumbnail to arrive at the grid that was already
 * on screen a second ago. The board does not change while you are reading About.
 *
 * A cache that can go stale needs a way to say so, which is the 🔄 beside the title, and
 * `invalidateBrowse()` for the one moment the app knows it is wrong.
 *
 * It is also written out, so the grid survives the window closing — `main/browse-cache.ts`
 * holds it for a day, which is as long as rows anyone would recognise are worth drawing.
 * This copy is still the one every render reads; the file is only how it starts.
 */
type CachedGrid = { query: string; posts: Post[]; hasMore: boolean; at: number }

export const cached: Partial<Record<Board, CachedGrid | null>> = {}

/** The board is passed rather than read here: the reads that call this are awaited, and a
 *  switch that landed while one was in flight would file its rows under the wrong board. */
export function remember(query: string, posts: Post[], hasMore: boolean, board: Board): void {
  // `at` is the last read, Load more included: what the line beside the title answers is
  // "how old is what I am looking at", and a chunk that landed a second ago is part of it.
  cached[board] = { query, posts, hasMore, at: Date.now() }
  // And through to `app-cache/browse.json`, so the same rows survive the window closing.
  // Not awaited: the grid is already drawn from the copy above, and a write that fails
  // costs the next launch a read it was going to be able to do anyway.
  void window.api.writeBrowseCache({ query, posts, hasMore, board })
}

/**
 * Drops the remembered grid without reading anything, so the next visit asks the board.
 * Called when an upload lands — the one change this window makes that the grid cannot
 * see, an edit being something it walked into the editor to do — and by 🔄, which is the
 * one way a person says it.
 *
 * The file goes with it. A cache in two places that can be invalidated in one is a cache
 * that comes back from the dead on the next launch.
 */
export function invalidateBrowse(board: Board = currentBoard()): void {
  cached[board] = null
  void window.api.clearBrowseCache(board)
}

/**
 * The stored grid, back into the two module-level `let`s above, before anything renders.
 *
 * It has to happen first because `Browse` reads them synchronously on the way up — the
 * seed is what stops the mount running a search it did not need — and the file is behind
 * an IPC round trip. `App` awaits this alongside its first status read, which it is
 * already showing "Starting…" for, so the cost is nothing and the grid is either there or
 * not by the time any screen exists.
 *
 * The query comes back with the rows. Without it the box would be empty and the seed
 * check below would reject a cache held for a query nobody is asking any more, which is
 * the same as not having stored it.
 */
export async function hydrateBrowseCache(): Promise<void> {
  // Both boards, on the way up. The window opens on the gallery, but switching mode is one
  // press and a read behind an IPC round trip at that moment is the grid arriving after
  // the mount that was meant to seed from it — the same reasoning that put this before the
  // first render at all. Two small files, read once.
  await Promise.all(
    BOARDS.map(async (board) => {
      const file = await window.api.readBrowseCache(board)
      if (!file) return
      cached[board] = { query: file.query, posts: file.posts, hasMore: file.hasMore, at: file.at }
      lastQuery[board] = file.query
    })
  )
}

/**
 * A screenful, and what Load more adds — passed on every read, because the default on the
 * other side is `POSTS_PER_PAGE`, the *website's* page size. This used to be a label
 * only: the button said 24 and the read that ran behind it came back with ten.
 */
export const CHUNK = 20

/** How old the grid is: the time, and the date as well once it is no longer today's. */
export function readAt(at: number): string {
  const when = new Date(at)
  const time = when.toLocaleTimeString([], { timeStyle: 'short' })
  return when.toDateString() === new Date().toDateString()
    ? time
    : `${when.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`
}

/**
 * A query that is nothing but a post number, or null.
 *
 * Typing `11` into this box means post 11 far more often than it means a tag called `11`,
 * and reaching one post by its number is what this window is usually for — you have the
 * id from an upload, from the board, from a report. It is a convenience of *this box* and
 * not of the search grammar: `@common/data/search` is shared with the website and there is
 * one implementation of it, so a bare number still means a tag everywhere else.
 *
 * The tag reading is not given up, only tried second — `2024` is a plausible tag name, and
 * a board that has one would otherwise lose it to a post number that may not even exist.
 */
function asPostId(query: string): number | null {
  const value = Number(query.trim())
  return /^\d+$/.test(query.trim()) && Number.isSafeInteger(value) && value > 0 ? value : null
}

/**
 * One post, shaped like a page, so the id lookup and the search return the same thing.
 *
 * Exported for the upload screen's tag import, which is this box in a dialog: typing a
 * post number there means the same thing it means here, and a second implementation of
 * that convenience would be a second place for it to disagree.
 */
export async function readPosts(
  query: string,
  board: Board = currentBoard()
): Promise<{ posts: Post[]; hasMore: boolean }> {
  const id = asPostId(query)
  if (id !== null) {
    const loaded = await window.api.getPost(id, board)
    if (loaded) return { posts: [loaded.post], hasMore: false }
  }
  return window.api.searchPosts({ query, perPage: CHUNK, board })
}
