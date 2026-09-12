import { useEffect, useSyncExternalStore } from 'react'

/**
 * A set of tag rules, held outside React. Both rule sets need this and they need it the
 * same way, so it is written once and made twice — `implications.ts` and
 * `recommendations.ts` beside this file are the two.
 *
 * Outside React because the tag field consults them *while you type*, and every card in
 * the queue has one: state passed down from `App` would be a prop threaded through three
 * components whose only job is to forward it, and a round trip per keystroke would be a
 * file read per keystroke.
 *
 * Read once, not per mount — one query when the window opens, then memory. The rules are
 * on the board now rather than in a local file, so they can go stale in a way they could
 * not before: another install writing a rule, or this window renaming a tag one names.
 * `reload` is what answers that, and the Tags screen calls it wherever it changes the
 * vocabulary.
 */
/**
 * `W` is what a write takes, which is not the same question for all three users. The two
 * rule sets write one tag's list at a time — that is the unit a rule is written in, the
 * panel that edits one has exactly that tag open, and the write can then touch that tag's
 * rows alone, where a whole-file section was rewritten whole either
 * way, so they pass the whole map. Both hand back the set as it now stands.
 */
export type RuleStore<T, W extends unknown[]> = {
  /** The rules, kicking the first read if nothing has done it yet. */
  use: () => T
  /**
   * Whether a write is in flight. A rule used to be a line in a local file and landed
   * before the click finished; it is a round trip to the board now, and a panel that
   * looks identical during it is a panel you press twice.
   */
  useSaving: () => boolean
  /** Writes, and takes the answer that comes back as the new truth. */
  save: (...args: W) => Promise<void>
  /** Reads the set again, for everything that moves it without going through `save`. */
  reload: () => Promise<void>
}

export function createRuleStore<T extends object, W extends unknown[]>(
  read: () => Promise<T>,
  write: (...args: W) => Promise<T>,
  empty: T
): RuleStore<T, W> {
  let rules: T = empty
  let reading: Promise<void> | null = null
  // How many writes are in flight, not whether one is: two controls on the panel can be
  // used in the same breath, and a boolean would go quiet when the first of them answered
  let writing = 0
  // Which write is the latest. Clicks outrun round trips, so an earlier answer arriving
  // after a later one must not become the truth — the post editor's `writeId`, for the
  // reason it has one
  let writeId = 0
  const listeners = new Set<() => void>()

  const announce = (): void => {
    for (const listener of listeners) listener()
  }

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  /** One read for the whole window, however many components ask for it at once. */
  const ensureRead = (): Promise<void> => {
    if (!reading) {
      reading = read()
        .then((next) => {
          rules = next
          announce()
        })
        // An unreachable board costs the rules, not the ability to tag: the field
        // carries on with none rather than failing to render.
        .catch(() => {})
    }
    return reading
  }

  return {
    // Empty until the first answer lands, which is the honest state: a rule that has not
    // been read cannot fire, and the window is a few milliseconds old at that point.
    use: () => {
      const snapshot = useSyncExternalStore(subscribe, () => rules)
      useEffect(() => {
        void ensureRead()
      }, [])
      return snapshot
    },
    useSaving: () => useSyncExternalStore(subscribe, () => writing > 0),
    save: async (...args: W) => {
      const id = ++writeId
      writing += 1
      announce()
      try {
        const next = await write(...args)
        // A later write has already been sent, so this answer is one edit behind: its
        // own answer is what the screen should end on
        if (id !== writeId) return
        rules = next
        reading = Promise.resolve()
        announce()
      } catch (error) {
        // A write can fail now that the rules are the board's — an unreachable project, or
        // a name it has no tag for. Putting the board's answer back is the same thing the
        // post editor does with a control whose write failed: the screen must not go on
        // showing a rule that was never stored.
        console.error('Could not write the rule:', error instanceof Error ? error.message : error)
        if (id !== writeId) return
        reading = null
        await ensureRead()
      } finally {
        writing -= 1
        announce()
      }
    },
    reload: async () => {
      reading = null
      await ensureRead()
    },
  }
}
