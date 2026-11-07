import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { cacheDir } from './app-cache'
import { GRID, storedImage } from './image-cache'

/**
 * The picture a grid tile draws: the stored full size, scaled and cropped once to the box the
 * tile draws it in, in *device* pixels, with a proper kernel, and kept as
 * `app-cache/grid/<file_name>.<w>x<h>.webp`.
 *
 * Exactly that height, because any scaling left to Chromium shows. The tiles drew the full
 * size first, and a 2560px file shrunk to a 360px row on every paint came out jagged; a
 * 720px copy shrunk 2:1 was better and still visibly stair-stepped on hair and line art.
 * Drawn 1:1, the window does no filtering at all and the copy is the picture.
 *
 * WebP at quality 90 because it is a local copy whose only job is to look like the original
 * at a smaller size: it encodes in milliseconds where AVIF would take the CPU budget
 * `main/cpu.ts` exists to protect, and nothing here is ever uploaded. Same rules as the rest
 * of the cache — named by md5, never stale, swept by `forgetImage`.
 */

/** What a tile may ask for, per side. Below it is not a picture; above it is the full
 *  size's job. */
const MIN_SIDE = 16
const MAX_SIDE = 4096

/** `top` keeps the top of the picture and crops the bottom — a shelf cover, where a portrait
 *  cut to a square should keep the face rather than the middle of a torso. */
export type GridBox = { width: number; height: number; top: boolean }

/** `<w>x<h>`, or `<w>x<h>-top`, in device pixels, from the tile (`useDrawnBox`), or null for
 *  anything else. */
export function gridBox(asked: string | null): GridBox | null {
  const match = /^(\d{1,5})x(\d{1,5})(-top)?$/.exec(asked ?? '')
  if (!match) return null
  const clamp = (side: string) => Math.min(MAX_SIDE, Math.max(MIN_SIDE, Number(side)))
  return { width: clamp(match[1]), height: clamp(match[2]), top: match[3] !== undefined }
}

/** One spelling of a box, for its cache file and its in-flight key alike. */
const sizeName = ({ width, height, top }: GridBox) => `${width}x${height}${top ? '-top' : ''}`

const inFlight = new Map<string, Promise<Buffer | null>>()

async function make(
  fileName: string,
  fileExt: string,
  path: string,
  box: GridBox
): Promise<Buffer | null> {
  const { width, height, top } = box
  const file = join(cacheDir(), GRID, `${fileName}.${sizeName(box)}.webp`)
  if (existsSync(file)) {
    try {
      return readFileSync(file)
    } catch {
      // Unreadable is absent; made again below
    }
  }

  const original = await storedImage(fileName, fileExt, path)
  if (!original) return null

  try {
    const bytes = await sharp(original.bytes, { animated: true })
      // `cover`: the crop `object-cover` would make, done here at full quality — centred, or
      // held to the top for a shelf cover. Enlarging is allowed — a small original must still
      // fill the box, and Chromium would only upscale it less carefully.
      .resize({
        width,
        height,
        fit: 'cover',
        position: top ? 'top' : 'centre',
        kernel: 'lanczos3',
      })
      .webp({ quality: 90 })
      .toBuffer()
    try {
      mkdirSync(join(cacheDir(), GRID), { recursive: true })
      writeFileSync(file, bytes)
    } catch {
      // Served anyway; costs the next launch one resize
    }
    return bytes
  } catch {
    // A file sharp cannot read is still a file Chromium might: hand back the original
    return original.bytes
  }
}

/** One resize per image and size however many tiles ask for it at once. */
export function gridImage(
  fileName: string,
  fileExt: string,
  path: string,
  box: GridBox
): Promise<Buffer | null> {
  const key = `${fileName}:${sizeName(box)}`
  const held = inFlight.get(key)
  if (held) return held
  const job = make(fileName, fileExt, path, box).finally(() => inFlight.delete(key))
  inFlight.set(key, job)
  return job
}
