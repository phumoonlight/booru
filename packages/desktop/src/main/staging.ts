import { basename } from 'node:path'
import { stat } from 'node:fs/promises'
import sharp, { type Metadata } from 'sharp'
import { MAX_FILE_SIZE, MAX_FILE_SIZE_LABEL, MAX_PIXELS } from './limits'
import type { StageOutcome } from '../shared/api'

/**
 * Turning a picked or dropped path into a row in the queue.
 *
 * The web stages a `File` straight from the input and can only check its size — it has
 * no way to look inside without reading the whole thing into the page. Here the file is
 * already on the same machine, so everything that would otherwise fail halfway through
 * an upload is settled first: is it an image at all, is it within the limits, and what
 * does it look like.
 *
 * The preview is a downscaled WebP rather than the file itself. A 40MB image in an
 * `<img>` costs the renderer a full-size decode per row, and forty of those is the
 * difference between a queue that scrolls and one that doesn't. It also means no
 * `file://` access and no custom protocol: the renderer only ever sees a small data URL.
 */

/**
 * The row preview's bounds, set against the box the queue draws it in: 768px tall and
 * the width of the window (`h-192` on a one-column grid). The old 200px was a 4x upscale
 * there — visibly soft, which is no use for a picture whose whole job is letting you tell
 * two pages of a set apart before you tag them.
 *
 * Not quite the 2x a HiDPI screen would want, which would be 1536. Stopping at 1024 is
 * the payload talking: every staged row holds its preview as base64 in the window for as
 * long as it is queued, ~190kB a row at this size against the 13kB it was, so a queue of
 * forty is around 7MB and 1536 would be nearer 15MB. This is the expensive constant in
 * the app and the number to cut first if a long queue ever feels heavy.
 *
 * Height is the bound that matters, the same way it is for the real thumbnail: the box is
 * far wider than it is tall, so everything but a panorama is height-bound when it fits.
 * The width cap is for the panorama, which would otherwise encode thousands of pixels
 * across — `fit: 'inside'` falls back to it, and the short height that yields is what the
 * card shows anyway.
 *
 * Changing `h-192` in upload-queue.tsx without changing these is what makes it blurry
 * again.
 */
const PREVIEW_HEIGHT = 1024
const PREVIEW_WIDTH = 1600

/**
 * The bound on the one image the queue blows up when a row is clicked. Big enough to fill
 * a maximised window on a 2x display and no bigger: this is a look at what you staged,
 * not the file, and every pixel past the screen is base64 crossing the bridge for nothing.
 */
const FULL_PREVIEW_EDGE = 1600

async function stageOne(path: string): Promise<StageOutcome> {
  const name = basename(path)

  let size: number
  try {
    const info = await stat(path)
    if (!info.isFile()) return { ok: false, path, name, error: 'Not a file' }
    size = info.size
  } catch {
    return { ok: false, path, name, error: 'Could not read this file' }
  }

  if (size === 0) return { ok: false, path, name, error: 'Empty file' }
  if (size > MAX_FILE_SIZE) {
    return { ok: false, path, name, error: `Too large (max ${MAX_FILE_SIZE_LABEL})` }
  }

  // Header read only — this is where a .txt renamed to .png is caught, for free.
  let meta: Metadata
  try {
    meta = await sharp(path).metadata()
  } catch {
    return { ok: false, path, name, error: 'Not a readable image' }
  }

  // Same swap the pipeline makes: EXIF orientations 5-8 turn the image a quarter turn
  // and metadata() reports the size before the turn.
  const quarterTurned = (meta.orientation ?? 1) >= 5
  const width = (quarterTurned ? meta.height : meta.width) ?? 0
  const height = (quarterTurned ? meta.width : meta.height) ?? 0
  if (!width || !height) return { ok: false, path, name, error: 'Unsupported image format' }
  if (width * height > MAX_PIXELS) {
    return {
      ok: false,
      path,
      name,
      error: `Too many pixels (max ${MAX_PIXELS / 1_000_000}MP)`,
    }
  }

  let preview = ''
  try {
    const thumb = await sharp(path)
      .rotate()
      .resize({
        fit: 'inside',
        withoutEnlargement: true,
        height: PREVIEW_HEIGHT,
        width: PREVIEW_WIDTH,
      })
      .webp({ quality: 70 })
      .toBuffer()
    preview = `data:image/webp;base64,${thumb.toString('base64')}`
  } catch {
    // A row with no picture is still uploadable — the real thumbnail is made later,
    // by the pipeline, from the file rather than from this.
  }

  return { ok: true, path, name, size, width, height, preview }
}

/**
 * Stages a batch. Sequential on purpose: each of these decodes an image, and sharp
 * already spreads one decode across the thread pool, so running twenty at once would
 * only make the first row appear later.
 */
export async function stageFiles(paths: string[]): Promise<StageOutcome[]> {
  const outcomes: StageOutcome[] = []
  for (const path of paths) {
    outcomes.push(await stageOne(path))
  }
  return outcomes
}

/**
 * A bigger look at one already-staged file, made on demand rather than at staging time.
 * Forty of these held in the queue's state would be tens of megabytes of base64 sitting
 * in the window for a picture nobody asked to see; one at a time costs a decode.
 *
 * Same contract as the row preview: '' rather than a throw, because a viewer that can't
 * draw anything is a message, not a failure of the upload the row is still staged for.
 */
export async function previewFile(path: string): Promise<string> {
  try {
    const full = await sharp(path)
      .rotate()
      .resize({
        width: FULL_PREVIEW_EDGE,
        height: FULL_PREVIEW_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer()
    return `data:image/webp;base64,${full.toString('base64')}`
  } catch {
    return ''
  }
}
