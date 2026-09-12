import { useEffect, useReducer, useState } from 'react'
import { BOARDS, type Board } from '@common/board'
import type { Tag } from '@common/tags'
import { invalidateTagNames } from './tag-names'
import { reloadFormSections } from '../form-sections'
import { reloadImplications } from '../implications'
import { reloadRecommendations } from '../recommendations'

/**
 * The last index read, kept outside React on purpose. The Tags screen is unmounted whenever
 * another view is in front of it (`App.tsx`), so component state meant a full re-read of
 * every tag on the board each time the header was clicked — a round trip to answer a
 * question whose answer had not changed. It only changes when something uploads, which
 * is rare enough that a list from a minute ago is the right default and a re-read is
 * worth asking for: hence 🔄 beside the title, and `invalidateTags()` below.
 *
 * Deliberately not persisted. It is a session's convenience, not state worth a file.
 *
 * **One per board**, because the number is per board. The names, categories, marks and
 * sections in it are one vocabulary either side — which is why this is one screen and not
 * two — but `post_count` is the column that grid sorts by and draws, and a count from the
 * other board would be the one wrong thing on a screen otherwise entirely about the
 * vocabulary.
 */
const cached: Partial<Record<Board, { tags: Tag[]; at: number } | null>> = {}

/**
 * Drops the cache without fetching, so the next visit reads the board again. Called when
 * an upload or an edit lands: that moves counts, which is exactly the moment a remembered
 * index becomes wrong.
 *
 * Both boards, because the callers that matter most — a rename, a delete — change the
 * vocabulary, which both copies hold. An upload only moves one board's counts and drops
 * the other's copy for nothing; a read it did not need is a cheaper mistake than a count
 * nobody notices is stale.
 */
export function invalidateTags(): void {
  for (const board of BOARDS) cached[board] = null
}

/**
 * One board's tags, and the two things that can be done to that answer: wait for it, or
 * ask for it again.
 *
 * **The list is read from the module cache as it is drawn, not copied into state.**
 *
 * It was a copy, and a copy is what made the mode switch wrong: the effect that filled
 * it returned early whenever the board it switched to was already cached, so the first
 * switch re-read the other board and switching back left the rows of one board showing
 * the counts of the other, for as long as the screen stayed open. Deriving it is not a
 * patch on that — it removes the thing that could disagree. `cached[board]` is the only
 * answer to "what does this board's index say", and there is now one of it.
 *
 * The screen is deliberately **not** remounted when the mode changes, unlike Browse which
 * is keyed on it: the filter you typed, the tag you have open and which categories you
 * unfolded are all worth keeping across a switch, since a switch is a question about
 * counts rather than about what you were doing.
 */
export function useTagIndex(board: Board) {
  /**
   * `bump` is what tells React the module-level object moved — a mutation outside React is
   * invisible to it. A reducer rather than a counter in `useState`, so there is no number
   * to name and nothing reading it.
   */
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const held = cached[board] ?? null
  const tags = held?.tags ?? null
  const fetchedAt = held?.at ?? null

  /**
   * Why the list could not be read, or ''. `listTags` throws now rather than answering with
   * an empty list — a refused query and a board with no tags are not the same thing — so
   * this has to have somewhere to put the difference. Without it a failed read left `tags`
   * null and "Loading…" on screen for good, with Refresh disabled by the same flag.
   *
   * It carries the board it happened on, so switching mode clears it without anything
   * having to remember to: a failure is about one board's read and says nothing about the
   * other's.
   */
  const [failure, setFailure] = useState<{ board: Board; message: string } | null>(null)
  const loadError = failure?.board === board ? failure.message : ''

  /** True while 🔄 is re-reading. The ordinary first read needs no flag: with nothing
   *  cached and no error, "loading" is what having no rows *means*. */
  const [refreshing, setRefreshing] = useState(false)
  const loading = refreshing || (tags === null && loadError === '')

  /**
   * Only when there is nothing to show — for this board. Coming back to the screen, or
   * switching back to a board read earlier, paints the list already held; the 🔄 beside the
   * title is how you ask for a new one.
   *
   * Nothing is set synchronously here. The rows and the "Loading…" under them both derive
   * from the cache, so a board with no copy yet already draws as loading on the render the
   * switch causes, one round trip before this effect could have said so.
   */
  useEffect(() => {
    if (cached[board]) return

    let alive = true
    void window.api
      .listTags(board)
      .then((next) => {
        cached[board] = { tags: next, at: Date.now() }
        if (alive) bump()
      })
      .catch((error: unknown) => {
        if (!alive) return
        setFailure({
          board,
          message: error instanceof Error ? error.message : 'Could not read the tags.',
        })
      })
    return () => {
      alive = false
    }
  }, [board])

  async function refresh() {
    setRefreshing(true)
    // Both copies, or the button lies: main keeps the index for a day (`main/tag-cache.ts`)
    // and would hand back the same list this screen is already showing. 🔄 means "read the
    // board", which is a thing only main can do.
    await window.api.clearTagCache()
    // Creating, renaming and deleting all land here, and they are the only things that can
    // change the names the tag pickers offer — this is where that copy is dropped too.
    invalidateTagNames()
    // And the rules, which are rows keyed by tag id: a rename carries every rule naming
    // that tag and a delete takes them with it, both on the board and both invisible to a
    // window still holding the names from before.
    await Promise.all([reloadImplications(), reloadRecommendations(), reloadFormSections()])
    try {
      const next = await window.api.listTags(board)
      cached[board] = { tags: next, at: Date.now() }
      setFailure(null)
      bump()
    } catch (error) {
      // The list already on screen stands: a failed re-read is a reason to say so, not a
      // reason to throw away the copy that is still the best answer anyone has.
      setFailure({
        board,
        message: error instanceof Error ? error.message : 'Could not read the tags.',
      })
    } finally {
      setRefreshing(false)
    }
  }

  return { tags, fetchedAt, loading, loadError, refresh }
}
