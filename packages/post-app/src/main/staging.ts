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

const PREVIEW_HEIGHT = 200

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
      .resize({ height: PREVIEW_HEIGHT, fit: 'inside', withoutEnlargement: true })
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
