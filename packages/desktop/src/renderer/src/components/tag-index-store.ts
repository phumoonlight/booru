import { useEffect, useReducer, useState } from 'react'
import type { Tag } from '@common/tags'
import { invalidateTagNames } from './tag-names'
import { reloadFormSections } from '../form-sections'
import { reloadImplications } from '../implications'
import { reloadRecommendations } from '../recommendations'

/**
 * The last index read, kept outside React on purpose. The Tags screen is unmounted whenever
 * another view is in front of it (`App.tsx`), so component state meant a full re-read of
 * every tag on the board each time the header was clicked — a round trip to answer a
 * question whose answer had not changed. Hence 🔄 beside the title for a re-read.
 *
 * Deliberately not persisted. It is a session's convenience, not state worth a file.
 */
let cached: { tags: Tag[]; at: number } | null = null

/**
 * The board's tags, and the two things that can be done to that answer: wait for it, or
 * ask for it again.
 *
 * **The list is read from the module cache as it is drawn, not copied into state**, so
 * `cached` is the only answer to "what does the index say", and there is one of it.
 */
export function useTagIndex() {
  /**
   * `bump` is what tells React the module-level object moved — a mutation outside React is
   * invisible to it. A reducer rather than a counter in `useState`, so there is no number
   * to name and nothing reading it.
   */
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const tags = cached?.tags ?? null
  const fetchedAt = cached?.at ?? null

  /**
   * Why the list could not be read, or ''. `listTags` throws rather than answering with an
   * empty list — a refused query and a board with no tags are not the same thing — so this
   * has to have somewhere to put the difference. Without it a failed read left `tags` null
   * and "Loading…" on screen for good, with Refresh disabled by the same flag.
   */
  const [loadError, setLoadError] = useState('')

  /** True while 🔄 is re-reading. The ordinary first read needs no flag: with nothing
   *  cached and no error, "loading" is what having no rows *means*. */
  const [refreshing, setRefreshing] = useState(false)
  const loading = refreshing || (tags === null && loadError === '')

  /** Only when there is nothing to show. Coming back to the screen paints the list already
   *  held; the 🔄 beside the title is how you ask for a new one. */
  useEffect(() => {
    if (cached) return

    let alive = true
    void window.api
      .listTags()
      .then((next) => {
        cached = { tags: next, at: Date.now() }
        if (alive) bump()
      })
      .catch((error: unknown) => {
        if (!alive) return
        setLoadError(error instanceof Error ? error.message : 'Could not read the tags.')
      })
    return () => {
      alive = false
    }
  }, [])

  async function refresh() {
    setRefreshing(true)
    // Both copies, or the button lies: main keeps the index for a day (`main/tag-cache.ts`)
    // and would hand back the same list this screen is already showing. 🔄 means "read the
    // board", which is a thing only main can do.
    await window.api.clearTagCache()
    // Creating, renaming and deleting all land here, and they are the only things that can
    // change the names the rule boxes offer — this is where that copy is dropped too.
    invalidateTagNames()
    // And the rules, which are rows keyed by tag id: a rename carries every rule naming
    // that tag and a delete takes them with it, both on the board and both invisible to a
    // window still holding the names from before.
    await Promise.all([reloadImplications(), reloadRecommendations(), reloadFormSections()])
    try {
      const next = await window.api.listTags()
      cached = { tags: next, at: Date.now() }
      setLoadError('')
      bump()
    } catch (error) {
      // The list already on screen stands: a failed re-read is a reason to say so, not a
      // reason to throw away the copy that is still the best answer anyone has.
      setLoadError(error instanceof Error ? error.message : 'Could not read the tags.')
    } finally {
      setRefreshing(false)
    }
  }

  return { tags, fetchedAt, loading, loadError, refresh }
}
