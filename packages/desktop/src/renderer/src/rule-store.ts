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
 * Read once, not per mount. Unlike the tag index these are a local file that nothing but
 * this window can change, so there is no staleness to refresh away and `save` is the only
 * thing that moves them.
 */
export type RuleStore<T> = {
  /** The rules, kicking the first read if nothing has done it yet. */
  use: () => T
  /** Writes the whole set and takes main's normalised answer as the new truth. */
  save: (next: T) => Promise<void>
}

export function createRuleStore<T extends object>(
  read: () => Promise<T>,
  write: (next: T) => Promise<T>,
  empty: T
): RuleStore<T> {
  let rules: T = empty
  let reading: Promise<void> | null = null
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
        // An unreadable rule file costs the rules, not the ability to tag: the field
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
    save: async (next: T) => {
      rules = await write(next)
      reading = Promise.resolve()
      announce()
    },
  }
}
