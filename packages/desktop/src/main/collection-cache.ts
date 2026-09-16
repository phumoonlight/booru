import type { Collection, CollectionPostPage } from '@common/data/collections'
import { dropCache, isFresh, readCache, writeCache } from './app-cache'

/**
 * The shelves as this window last read them: the list on disk for a day, each screenful of
 * one shelf's images in memory for the session.
 *
 * This app had no cache of its own for a long time, and the argument was that a shelf list
 * is a handful of rows. The rows are cheap; the *round trip* is not — the board is a
 * Postgres instance on the other side of a home connection, and every glance at Settings
 * unmounts this screen and pays for the list again on the way back. What is being cached
 * is the wait, not the bytes.
 *
 * **Two lifetimes, because the two go stale differently.** The list is small and complete,
 * so it is written out and survives a restart — a day, the same day `main/tag-cache.ts`
 * keeps the vocabulary for, and 🔄 is the way past it. A shelf's images are pages cut at a
 * cursor, so a copy of one is only right until something lands on that shelf; they are held
 * for the session and thrown away whole by every write. Nothing here is written to disk
 * that a write could not immediately contradict.
 *
 * **Every write drops all of it** (`dropCollectionCache`). A shelf's `updated_at` moves
 * when an image is added, removed or moved, which reorders the list and changes a cover, so
 * there is no write in this app whose effect is confined to one cached answer — and a cache
 * that is right about most of what it holds is the one that is hard to reason about.
 */

const CACHE_FILE = 'collections.json'

type CacheFile = { at: number; collections: Collection[] }

/** The list in memory. `undefined` means the file has not been looked at yet. */
let memory: CacheFile | null | undefined
/** One read at a time, however many callers arrive while it runs. */
let filling: Promise<Collection[]> | null = null

/** One screenful of one shelf, by the cursor it was asked for with. */
const pages = new Map<string, CollectionPostPage>()

function readFile(): CacheFile | null {
  const parsed = readCache(CACHE_FILE)
  if (!parsed) return null

  const { at, collections } = parsed as Partial<CacheFile>
  if (typeof at !== 'number' || !Array.isArray(collections)) return null
  // A copy written before `mark`, `rating` or `is_ai` existed would draw every shelf as an
  // unmarked General one for up to a day, with nothing on screen to explain it.
  const first = collections[0]
  if (first && !('mark' in first && 'rating' in first && 'is_ai' in first)) return null
  return { at, collections }
}

/**
 * The shelf list, read from the board if what we have is missing, a day old, or `force` —
 * which is 🔄 Refresh, the one press whose whole meaning is "ask again".
 *
 * A failed read serves what we have rather than nothing: shelves from this morning are a
 * far better answer than an empty screen, and the next press tries again.
 */
export async function cachedCollections(
  read: () => Promise<Collection[]>,
  force = false
): Promise<Collection[]> {
  if (memory === undefined) memory = readFile()
  const held = memory
  if (!force && held && isFresh(held.at)) return held.collections
  if (filling) return filling

  const fill = (async () => {
    try {
      const collections = await read()
      const next = { at: Date.now(), collections }
      memory = next
      writeCache(CACHE_FILE, next)
      return collections
    } catch {
      return memory?.collections ?? []
    } finally {
      filling = null
    }
  })()

  filling = fill
  return fill
}

/** One shelf's screenful, by shelf, cursor, size and the tag pills lit — the four things
 *  that decide which rows come back. Held for the session only; see the note at the top. */
export async function cachedCollectionPosts(
  key: { collectionId: number; after?: number; perPage?: number; tags?: string[] },
  read: () => Promise<CollectionPostPage>
): Promise<CollectionPostPage> {
  // Sorted, so lighting two pills in either order is one page and not two.
  const tags = [...(key.tags ?? [])].sort().join(' ')
  const id = `${key.collectionId}:${key.after ?? 0}:${key.perPage ?? 0}:${tags}`
  const held = pages.get(id)
  if (held) return held

  const page = await read()
  // An empty answer from a board that could not be reached would otherwise be remembered
  // as "this shelf is empty" for the rest of the session.
  if (page.posts.length > 0) pages.set(id, page)
  return page
}

/** Drops all of it — the list, the file and every page. Every write calls it; 🔄 Refresh
 *  goes past it with `force` rather than through here, since a press that reads the board
 *  again has no reason to throw away the pages it did not ask about. */
export function dropCollectionCache(): void {
  memory = null
  pages.clear()
  dropCache(CACHE_FILE)
}
