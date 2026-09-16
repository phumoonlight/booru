import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cacheDir } from './app-cache'
import { boardImageUrl } from './config'

/**
 * Every stored image this window has drawn, kept as the files they already are —
 * `app-cache/thumbs/<file_name>.avif` for the grids, `app-cache/images/<file_name>.<ext>`
 * for the one a viewer is showing full size.
 *
 * It began as the browse grid's thumbnails, whose rows came back from disk the moment the
 * window opened while the pictures were re-downloaded, a request per card. The grid is
 * gone; the reasoning is not, and a shelf reopened after a restart is the same case. The
 * full sizes joined it for the same reason one step up: they are megabytes each, and
 * looking at the same image twice should cost the network once.
 *
 * Bytes on disk rather than `data:` URLs in the JSON, which is the whole reason it is a
 * folder and not a third file. Base64 is a third bigger than what it encodes, a map of a
 * few hundred of them is megabytes rewritten in full whenever one arrives, and the grid
 * is not the only thing that draws a thumbnail. A file per image is written once and
 * never again.
 *
 * Nothing here expires, and there is nothing to invalidate. `file_name` is the md5 of the
 * bytes, so a file found under that name *is* that image — the same reasoning the
 * in-memory map below already runs on, one restart further out. The folder is therefore
 * bounded by the board itself; an image that is deleted takes both of its cached files
 * with it (`forgetImage`).
 *
 * **Only the thumbnails are held in memory.** One is a few kilobytes and a grid asks for
 * the same ones over and over; a full size is whole megabytes as base64, and it is asked
 * for by one click at a time. Holding those would trade the network cost this is here to
 * remove for a heap that grows with every picture looked at.
 */

const THUMBS = 'thumbs'
const IMAGES = 'images'

/**
 * Names come from a database column and are turned into a path, which is the one thing
 * worth checking before any of it reaches the filesystem. An md5 is hex and an extension
 * is a word; anything else simply misses the cache and is fetched, so a board that someday
 * names files differently loses a cache rather than writing somewhere it shouldn't.
 */
const SAFE_NAME = /^[a-zA-Z0-9]{1,64}$/
const SAFE_EXT = /^[a-zA-Z0-9]{1,8}$/

function filePath(folder: string, fileName: string, ext: string): string | null {
  if (!SAFE_NAME.test(fileName) || !SAFE_EXT.test(ext)) return null
  return join(cacheDir(), folder, `${fileName}.${ext}`)
}

/** What a stored extension means to an `<img>`. Unknown answers AVIF, which is what this
 *  board writes unless the uploaded bytes won the comparison. */
const TYPES: Record<string, string> = {
  avif: 'image/avif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

function dataUrl(ext: string, bytes: Buffer): string {
  return `data:${TYPES[ext.toLowerCase()] ?? 'image/avif'};base64,${bytes.toString('base64')}`
}

/** The stored file as the `data:` URL the window wants, or null if it isn't held. */
function readFile(path: string | null, ext: string): string | null {
  if (!path || !existsSync(path)) return null

  try {
    return dataUrl(ext, readFileSync(path))
  } catch {
    // A file that cannot be read is a file we do not have; the fetch behind it stands
    return null
  }
}

function writeFile(folder: string, path: string | null, bytes: Buffer): void {
  if (!path) return

  try {
    mkdirSync(join(cacheDir(), folder), { recursive: true })
    writeFileSync(path, bytes)
  } catch (error) {
    // Costs the next launch one download, which is what it was doing before this existed
    console.error('Could not cache an image:', error instanceof Error ? error.message : error)
  }
}

/**
 * Every thumbnail already turned into a `data:` URL this session. The window's CSP is
 * `img-src 'self' data:` and stays that way, so an image crosses the bridge as one; a
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

  const file = filePath(THUMBS, fileName, 'avif')
  const stored = readFile(file, 'avif')
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
    writeFile(THUMBS, file, bytes)
    const encoded = dataUrl('avif', bytes)
    thumbnails.set(fileName, encoded)
    return encoded
  } catch {
    return ''
  }
}

/**
 * The stored image at full size, for a viewer. Disk, then the network — no memory step,
 * for the reason at the top of this file.
 *
 * `fileExt` is the row's, because the stored object is the AVIF only when it beat the
 * uploaded bytes (`@common/upload/pipeline`), and a viewer asking for the wrong extension
 * would get a 404 rather than a picture.
 */
export async function cachedImage(
  fileName: string,
  fileExt: string,
  path: string
): Promise<string> {
  const file = filePath(IMAGES, fileName, fileExt)
  const stored = readFile(file, fileExt)
  if (stored) return stored

  const url = boardImageUrl(path)
  if (!url) return ''

  try {
    const response = await fetch(url)
    if (!response.ok) return ''

    const bytes = Buffer.from(await response.arrayBuffer())
    writeFile(IMAGES, file, bytes)
    return dataUrl(fileExt, bytes)
  } catch {
    return ''
  }
}

/**
 * A file that has just stopped existing anywhere — both folders and the map. A deleted
 * image is the one case where a name stops meaning an image that exists, and so the only
 * thing in here that has to be swept up.
 */
export function forgetImage(fileName: string, fileExt: string): void {
  thumbnails.delete(fileName)
  for (const path of [filePath(THUMBS, fileName, 'avif'), filePath(IMAGES, fileName, fileExt)]) {
    if (!path) continue
    try {
      rmSync(path, { force: true })
    } catch {
      // An orphan of a few kilobytes that nothing will ask for again
    }
  }
}
