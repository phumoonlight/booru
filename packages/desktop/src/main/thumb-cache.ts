import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cacheDir } from './app-cache'
import { boardImageUrl } from './config'

/**
 * The thumbnails the shelves and the artist list draw, kept as the files they already are —
 * `app-cache/thumbs/<file_name>.avif` — and in memory in front of that.
 *
 * It began as the browse grid's, whose rows came back from disk the moment the window
 * opened while the pictures were re-downloaded, a request per card. The grid is gone; the
 * reasoning is not, and a shelf reopened after a restart is the same case.
 *
 * Bytes on disk rather than `data:` URLs in the JSON, which is the whole reason it is a
 * folder and not a third file. Base64 is a third bigger than what it encodes, a map of a
 * few hundred of them is megabytes rewritten in full whenever one arrives, and the grid
 * is not the only thing that draws a thumbnail. A file per image is written once and
 * never again.
 *
 * Nothing here expires, and there is nothing to invalidate. `file_name` is the md5 of the
 * bytes, so a thumbnail found under that name *is* that image — the same reasoning the
 * in-memory maps on both sides of the bridge already run on, one restart further out. The
 * folder is therefore bounded by the board itself, one small file per image; an image that
 * is deleted takes its cached thumbnail with it (`forgetThumbnail`).
 */

const FOLDER = 'thumbs'

/**
 * Names come from a database column and are turned into a path, which is the one thing
 * worth checking before any of it reaches the filesystem. An md5 is hex; anything that
 * isn't simply misses the cache and is fetched, so a board that someday names files
 * differently loses a cache rather than writing somewhere it shouldn't.
 */
const SAFE_NAME = /^[a-zA-Z0-9]{1,64}$/

function thumbPath(fileName: string): string | null {
  return SAFE_NAME.test(fileName) ? join(cacheDir(), FOLDER, `${fileName}.avif`) : null
}

/** The stored thumbnail as the `data:` URL the window wants, or null if it isn't held. */
function readThumb(fileName: string): string | null {
  const path = thumbPath(fileName)
  if (!path || !existsSync(path)) return null

  try {
    return `data:image/avif;base64,${readFileSync(path).toString('base64')}`
  } catch {
    // A file that cannot be read is a file we do not have; the fetch behind it stands
    return null
  }
}

function writeThumb(fileName: string, bytes: Buffer): void {
  const path = thumbPath(fileName)
  if (!path) return

  try {
    mkdirSync(join(cacheDir(), FOLDER), { recursive: true })
    writeFileSync(path, bytes)
  } catch (error) {
    // Costs the next launch one download, which is what it was doing before this existed
    console.error('Could not cache a thumbnail:', error instanceof Error ? error.message : error)
  }
}

/** A deleted image's thumbnail. The one case where a name stops meaning an image that
 *  exists, and so the only thing in here that has to be swept up. */
function dropThumb(fileName: string): void {
  const path = thumbPath(fileName)
  if (!path) return

  try {
    rmSync(path, { force: true })
  } catch {
    // An orphan of a few kilobytes that nothing will ask for again
  }
}

/**
 * Every thumbnail already turned into a `data:` URL this session. The window's CSP is
 * `img-src 'self' data:` and stays that way, so a thumbnail crosses the bridge as one; a
 * grid scrolled back up should not re-fetch what it just had, and the name being the md5
 * of the bytes means an entry here can never go stale.
 */
const thumbnails = new Map<string, string>()

/**
 * Memory, then `app-cache/thumbs`, then the network — each step filling in the ones before
 * it, and only the last one costing anything.
 *
 * `path` is the object's path under the bucket, which is the only thing that differs
 * between a shelf's image and an artist's example: the *name* is the md5 of the uploaded
 * bytes either way, so the cache is rightly shared. The bucket is public, so the fetch is a
 * plain GET with no key on it — the same URL the website draws.
 */
export async function cachedThumbnail(fileName: string, path: string): Promise<string> {
  const cached = thumbnails.get(fileName)
  if (cached) return cached

  const stored = readThumb(fileName)
  if (stored) {
    thumbnails.set(fileName, stored)
    return stored
  }

  const url = boardImageUrl(path)
  if (!url) return ''

  try {
    const response = await fetch(url)
    if (!response.ok) return ''

    const bytes = Buffer.from(await response.arrayBuffer())
    writeThumb(fileName, bytes)
    const dataUrl = `data:image/avif;base64,${bytes.toString('base64')}`
    thumbnails.set(fileName, dataUrl)
    return dataUrl
  } catch {
    return ''
  }
}

/** A file that has just stopped existing anywhere — both caches, memory and disk. */
export function forgetThumbnail(fileName: string): void {
  thumbnails.delete(fileName)
  dropThumb(fileName)
}
