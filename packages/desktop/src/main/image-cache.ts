import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cacheDir } from './app-cache'
import { boardImageUrl } from './config'

/**
 * Every stored image this window has drawn, kept as the file it already is —
 * `app-cache/images/<file_name>.<ext>` — and the grid's copies cut from it
 * (`app-cache/grid/`, `main/grid-image.ts`). The window reaches both through
 * `board-image://` (`main/image-protocol.ts`), never as `data:` URLs across the bridge.
 *
 * It began as the browse grid's thumbnails, whose rows came back from disk the moment the
 * window opened while the pictures were re-downloaded, a request per card. The full sizes
 * joined for the same reason one step up: they are megabytes each, and looking at the same
 * image twice should cost the network once. Since the grids draw from the full size too,
 * the bucket's thumbnails are no longer fetched at all; `thumbs/` is only swept.
 *
 * Bytes on disk rather than base64 in JSON: base64 is a third bigger than what it encodes,
 * and a map of a few hundred of them is megabytes rewritten in full whenever one arrives.
 * A file per image is written once and never again.
 *
 * Nothing here expires, and there is nothing to invalidate. `file_name` is the md5 of the
 * bytes, so a file found under that name *is* that image. The folder is therefore bounded
 * by the board itself; an image that is deleted takes its cached files with it
 * (`forgetImage`). Nothing is held in memory here — Chromium keeps what it has decoded.
 */

const THUMBS = 'thumbs'
const IMAGES = 'images'
/** The grid's resized copies (`main/grid-image.ts`), named here so `forgetImage` sweeps them. */
export const GRID = 'grid'

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
 * The stored image at full size, as bytes and a media type. Disk, then the network, filling
 * the disk.
 *
 * `path` is the object's path under the bucket, which is the only thing that differs
 * between a shelf's image and an artist's example: the *name* is the md5 of the uploaded
 * bytes either way, so the cache is rightly shared. The bucket is public, so the fetch is a
 * plain GET with no key on it — the same URL the website draws. `fileExt` is the row's,
 * because the stored object is the AVIF only when it beat the uploaded bytes, and asking for
 * the wrong extension would get a 404 rather than a picture.
 */
export async function storedImage(
  fileName: string,
  fileExt: string,
  path: string
): Promise<{ bytes: Buffer; type: string } | null> {
  const type = TYPES[fileExt.toLowerCase()] ?? 'image/avif'
  const file = filePath(IMAGES, fileName, fileExt)
  if (file && existsSync(file)) {
    try {
      return { bytes: readFileSync(file), type }
    } catch {
      // Unreadable is absent; the fetch below stands
    }
  }

  const url = boardImageUrl(path)
  if (!url) return null

  try {
    const response = await fetch(url)
    if (!response.ok) return null

    const bytes = Buffer.from(await response.arrayBuffer())
    writeFile(IMAGES, file, bytes)
    return { bytes, type }
  } catch {
    return null
  }
}

/**
 * A file that has just stopped existing anywhere — every copy of it in here. A deleted
 * image is the one case where a name stops meaning an image that exists, and so the only
 * thing in here that has to be swept up.
 */
export function forgetImage(fileName: string, fileExt: string): void {
  for (const path of [
    filePath(THUMBS, fileName, 'avif'),
    filePath(IMAGES, fileName, fileExt),
    ...gridCopies(fileName),
  ]) {
    if (!path) continue
    try {
      rmSync(path, { force: true })
    } catch {
      // An orphan of a few kilobytes that nothing will ask for again
    }
  }
}

/** Every size the grid has made of one image — `<file_name>.<w>x<h>.webp`, one per box a
 *  tile has asked for. */
function gridCopies(fileName: string): string[] {
  if (!SAFE_NAME.test(fileName)) return []
  const dir = join(cacheDir(), GRID)
  try {
    return readdirSync(dir)
      .filter((name) => name.startsWith(`${fileName}.`))
      .map((name) => join(dir, name))
  } catch {
    return []
  }
}
