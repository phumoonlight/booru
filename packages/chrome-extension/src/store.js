/**
 * Read posts, as compactly as a browser will hold them.
 *
 * This runs on the *extension's* origin — the service worker and the settings page, never
 * the content script. A content script's `indexedDB` belongs to the board it is injected
 * into, which would mean one database per board, none of them reachable from a settings
 * page, and all of them thrown away with the board's site data. So the content script
 * asks and this answers.
 *
 * What is stored is post numbers and nothing else: no date, no title, no tags. A number
 * is the whole fact, and anything beside it would be a copy of something the board
 * already has.
 *
 * **The shape is per bucket, whichever is smaller.** Ids are grouped 65536 to a record. A
 * record holds either a sorted `Uint16Array` of the offsets it contains — two bytes per
 * read post — or an 8KB bitmap, one bit per id in the range. Scattered reading, which is
 * what actually happens, stays on the list and costs two bytes a post; a bucket read past
 * a quarter full flips to the bitmap, where the list would have been the larger of the
 * two. A bitmap alone would have cost 150 bytes per post for someone with ten thousand of
 * them spread over a board's twelve million, and a list alone would grow without ever
 * paying for the density it eventually reaches.
 *
 * Bucketing is also what makes a write incremental: marking a post rewrites one record,
 * never the whole set.
 *
 * **A bucket is wide because a record costs the same however little is in it.** Version 1
 * grouped 4096 to a record, which sounds tidy and is not: reading is scattered over a
 * board's whole history, so ten thousand read posts landed about three to a bucket and
 * spent forty bytes of key and index overhead to hold six bytes of ids — 130KB where
 * 65536-wide buckets hold the same ten thousand in 184 records and 27KB. The width is
 * capped there rather than measured: an offset has to fit the `Uint16Array` the sparse
 * shape is made of, and 65536 is exactly its range.
 */

const DB_NAME = 'booru-explorer'
const DB_VERSION = 2
const STORE = 'reads'

const BUCKET_BITS = 16
const BUCKET_SIZE = 1 << BUCKET_BITS
const BITMAP_BYTES = BUCKET_SIZE >> 3
// Past this many ids in one bucket the bitmap is the smaller of the two shapes.
const SPARSE_MAX = BITMAP_BYTES >> 1

// What version 1 grouped by. Only the migration needs it, and only to work out which post
// a record it is about to throw away was talking about.
const LEGACY_BUCKET_SIZE = 4096

let handle = null

function open() {
  if (handle) return handle
  handle = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (event) => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE)) {
        // The key is the pair, so one board's records sort together and a range over
        // `[site]` … `[site, []]` is every one of them — arrays sort after numbers in
        // IndexedDB, which is what makes that upper bound work.
        database.createObjectStore(STORE, { keyPath: ['site', 'bucket'] })
        return
      }
      // The bucket is part of the key, so widening it changes what every existing record
      // is about. Rewriting them is a few hundred kilobytes read once, and the
      // alternative is a store that quietly fades the wrong posts.
      if (event.oldVersion < 2) repack(request.transaction.objectStore(STORE))
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  // A worker that failed to open its database should try again on the next message
  // rather than answer nothing for as long as it happens to stay alive.
  handle.catch(() => {
    handle = null
  })
  return handle
}

/**
 * One transaction, resolved when it commits rather than when the last request answers —
 * the difference matters for writes, where a resolved promise has to mean "on disk".
 * `run` fills `box.value` from its own request callbacks, which all fire before commit.
 */
function withStore(mode, run) {
  return open().then(
    (database) =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE, mode)
        const box = {}
        transaction.oncomplete = () => resolve(box.value)
        transaction.onabort = () => reject(transaction.error)
        transaction.onerror = () => reject(transaction.error)
        run(transaction.objectStore(STORE), box)
      })
  )
}

const bucketOf = (id) => Math.floor(id / BUCKET_SIZE)
const offsetOf = (id) => id % BUCKET_SIZE

function siteRange(site) {
  return IDBKeyRange.bound([site], [site, []])
}

/** Every offset a record holds, as a Set — the editable form. */
function offsets(record) {
  const found = new Set()
  if (!record) return found
  if (record.kind === 'list') {
    for (const offset of record.data) found.add(offset)
    return found
  }
  for (let byte = 0; byte < record.data.length; byte += 1) {
    const bits = record.data[byte]
    if (!bits) continue
    for (let bit = 0; bit < 8; bit += 1) {
      if (bits & (1 << bit)) found.add(byte * 8 + bit)
    }
  }
  return found
}

/** Whether one offset is in the record, without unpacking the rest of it. */
function holds(record, offset) {
  if (!record) return false
  if (record.kind !== 'list') return (record.data[offset >> 3] & (1 << (offset & 7))) !== 0
  let low = 0
  let high = record.data.length - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    const at = record.data[mid]
    if (at === offset) return true
    if (at < offset) low = mid + 1
    else high = mid - 1
  }
  return false
}

function pack(site, bucket, found) {
  if (found.size === 0) return null
  if (found.size <= SPARSE_MAX) {
    const data = Uint16Array.from(found)
    data.sort()
    return { site, bucket, kind: 'list', data }
  }
  const data = new Uint8Array(BITMAP_BYTES)
  for (const offset of found) data[offset >> 3] |= 1 << (offset & 7)
  return { site, bucket, kind: 'map', data }
}

function count(record) {
  if (record.kind === 'list') return record.data.length
  let total = 0
  for (const byte of record.data) {
    let bits = byte
    while (bits) {
      total += bits & 1
      bits >>= 1
    }
  }
  return total
}

function group(ids) {
  const wanted = new Map()
  for (const id of ids) {
    if (!Number.isInteger(id) || id < 0) continue
    const bucket = bucketOf(id)
    const held = wanted.get(bucket)
    if (held) held.push(id)
    else wanted.set(bucket, [id])
  }
  return wanted
}

/**
 * Version 1 → 2: the same posts, regrouped into wider buckets.
 *
 * `offsets` reads either shape without being told how wide it is — a list is its own
 * length and a bitmap is its byte count — so only the multiplication back to an absolute
 * post number needs the old width. Everything is collected before anything is written,
 * because the clear and the writes are the same transaction and a half-migrated store is
 * worse than either version of it.
 */
function repack(store) {
  const held = new Map()
  const request = store.openCursor()
  request.onsuccess = () => {
    const cursor = request.result
    if (cursor) {
      const record = cursor.value
      const base = record.bucket * LEGACY_BUCKET_SIZE
      const ids = held.get(record.site) ?? []
      for (const offset of offsets(record)) ids.push(base + offset)
      held.set(record.site, ids)
      cursor.continue()
      return
    }
    store.clear()
    for (const [site, ids] of held) {
      for (const [bucket, ofBucket] of group(ids)) {
        const next = pack(site, bucket, new Set(ofBucket.map(offsetOf)))
        if (next) store.put(next)
      }
    }
  }
}

/**
 * Which of these ids are read. The answer is the subset, so a page of unread posts costs
 * an empty array rather than a hundred booleans.
 */
export function queryReads(site, ids) {
  const wanted = group(ids)
  return withStore('readonly', (store, box) => {
    const read = []
    box.value = read
    for (const [bucket, held] of wanted) {
      const request = store.get([site, bucket])
      request.onsuccess = () => {
        const record = request.result
        if (!record) return
        for (const id of held) {
          if (holds(record, offsetOf(id))) read.push(id)
        }
      }
    }
  })
}

/**
 * Mark or unmark, in one transaction however many ids are handed over — a whole page
 * marked at once is two or three records rewritten, not a hundred.
 */
export function markReads(site, ids, read) {
  const wanted = group(ids)
  return withStore('readwrite', (store, box) => {
    box.value = 0
    for (const [bucket, held] of wanted) {
      const request = store.get([site, bucket])
      request.onsuccess = () => {
        const found = offsets(request.result)
        const before = found.size
        for (const id of held) {
          if (read) found.add(offsetOf(id))
          else found.delete(offsetOf(id))
        }
        if (found.size === before) return
        box.value += Math.abs(found.size - before)
        const next = pack(site, bucket, found)
        if (next) store.put(next)
        else store.delete([site, bucket])
      }
    }
  })
}

/**
 * Every id a board holds, sorted — the export form, and the only place the compact
 * shapes are unpacked in full.
 */
export function listIds(site) {
  return withStore('readonly', (store, box) => {
    const ids = []
    box.value = ids
    const request = store.openCursor(siteRange(site))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        ids.sort((a, b) => a - b)
        return
      }
      const record = cursor.value
      const base = record.bucket * BUCKET_SIZE
      for (const offset of offsets(record)) ids.push(base + offset)
      cursor.continue()
    }
  })
}

export function clearSite(site) {
  return withStore('readwrite', (store, box) => {
    box.value = true
    store.delete(siteRange(site))
  })
}

/**
 * What is held, per board, for the settings page to say. A store that can be wrong while
 * everything else is right should be able to state what it thinks it has.
 */
export function stats() {
  return withStore('readonly', (store, box) => {
    const per = {}
    box.value = per
    const request = store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      const record = cursor.value
      const entry = per[record.site] ?? { posts: 0, bytes: 0, records: 0 }
      entry.posts += count(record)
      entry.bytes += record.data.byteLength
      entry.records += 1
      per[record.site] = entry
      cursor.continue()
    }
  })
}
