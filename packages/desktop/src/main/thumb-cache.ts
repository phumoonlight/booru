import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cacheDir } from './app-cache'

/**
 * The thumbnails the browse grid draws, kept as the files they already are —
 * `app-cache/thumbs/<file_name>.avif`.
 *
 * The rows come back from `browse-cache.json` the moment the window opens; the pictures
 * used to be re-downloaded, a request per card, for a grid that was on screen a minute
 * before it was closed. This is the other half of that.
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
 * folder is therefore bounded by the board itself, one small file per post; a post that
 * is deleted takes its cached thumbnail with it (`removePost`).
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
export function readThumb(fileName: string): string | null {
  const path = thumbPath(fileName)
  if (!path || !existsSync(path)) return null

  try {
    return `data:image/avif;base64,${readFileSync(path).toString('base64')}`
  } catch {
    // A file that cannot be read is a file we do not have; the fetch behind it stands
    return null
  }
}

export function writeThumb(fileName: string, bytes: Buffer): void {
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

/** A deleted post's thumbnail. The one case where a name stops meaning an image that
 *  exists, and so the only thing in here that has to be swept up. */
export function dropThumb(fileName: string): void {
  const path = thumbPath(fileName)
  if (!path) return

  try {
    rmSync(path, { force: true })
  } catch {
    // An orphan of a few kilobytes that nothing will ask for again
  }
}
