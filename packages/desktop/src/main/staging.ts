import { basename } from 'node:path'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import sharp, { type Metadata } from 'sharp'
import { findCollectionPostsByFileNames } from '@common/data/collections'
import { findArtistImagesByFileNames } from '@common/data/artists'
import { MAX_FILE_SIZE, MAX_FILE_SIZE_LABEL, MAX_PIXELS } from './limits'
import { boardDb } from './db'
import type { StageOutcome, StageTarget } from '../shared/api'

/**
 * Turning a picked or dropped path into a staged file, for a shelf or an artist.
 *
 * The file is already on the same machine, so everything that would otherwise fail halfway
 * through an upload is settled first: is it an image at all, is it within the limits, is
 * it already up, and what does it look like.
 *
 * The preview is a downscaled WebP rather than the file itself. A 40MB image in an
 * `<img>` costs the renderer a full-size decode per tile, and a batch of those is the
 * difference between a screen that scrolls and one that doesn't. It also means no
 * `file://` access and no custom protocol: the renderer only ever sees a small data URL.
 */

/**
 * The preview's bounds. Sized for the upload screen's full-width card, which is gone; the
 * staging batches draw these far smaller, so this is the constant to cut first if a large
 * batch ever feels heavy — every staged file holds its preview as base64 in the window.
 * Height is the bound that matters, as for the real thumbnail; the width cap is for the
 * panorama, which `fit: 'inside'` falls back to.
 */
const PREVIEW_HEIGHT = 1024
const PREVIEW_WIDTH = 1600

/**
 * The md5 of the file as it sits on disk — the same hash the upload takes of the bytes
 * it is handed, which is what makes it `file_name` and so the answer to "is this already
 * up". Streamed rather than read: a 50MB file has no reason to be in memory to be hashed,
 * and staging is already the slow step.
 */
async function md5Of(path: string): Promise<string> {
  const hash = createHash('md5')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

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
    // A file with no picture is still uploadable — the real thumbnail is made later,
    // by the pipeline, from the file rather than from this.
  }

  let md5: string
  try {
    md5 = await md5Of(path)
  } catch {
    return { ok: false, path, name, error: 'Could not read this file' }
  }

  return {
    ok: true,
    path,
    name,
    size,
    width,
    height,
    preview,
    md5,
    duplicateOf: null,
    duplicateIn: null,
  }
}

/**
 * Stages a batch. Sequential on purpose: each of these decodes an image, and sharp
 * already spreads one decode across the thread pool, so running twenty at once would
 * only make the first row appear later.
 */
export async function stageFiles(paths: string[], target: StageTarget): Promise<StageOutcome[]> {
  const outcomes: StageOutcome[] = []
  for (const path of paths) {
    outcomes.push(await stageOne(path))
  }
  return markDuplicates(outcomes, target)
}

/**
 * Which of these are already up, asked once for the whole batch and answered before
 * anything is uploaded. The pipeline refuses a duplicate anyway, but only after an encode —
 * the file is what is duplicated, and the file is known now.
 *
 * A failed query leaves every file a normal one: being unable to reach the board is not
 * evidence that an image is new, and the upload's own check is still there to say so.
 *
 * Neither question is scoped. `collection_posts.file_name` is unique across the whole
 * table, because an image lives on exactly one shelf, so the answer names the shelf as well
 * as the row — "already in Ukiyo-e studies" is the refusal somebody can act on. An artist's
 * examples are the same question again, answered with the artist's name.
 */
async function markDuplicates(
  outcomes: StageOutcome[],
  target: StageTarget
): Promise<StageOutcome[]> {
  const staged = outcomes.filter((outcome) => outcome.ok)
  if (staged.length === 0) return outcomes

  // A build with no project can still stage and preview files; it just cannot ask.
  const db = boardDb()
  if (!db) return outcomes

  const names = staged.map((outcome) => outcome.md5)

  let existing: Map<string, { id: number; owner: string }>
  try {
    existing =
      target === 'collection'
        ? mapOwner(await findCollectionPostsByFileNames(db, names), 'collection_name')
        : mapOwner(await findArtistImagesByFileNames(db, names), 'artist_name')
  } catch (error) {
    console.error('Could not check for duplicates:', error instanceof Error ? error.message : error)
    return outcomes
  }

  return outcomes.map((outcome) => {
    if (!outcome.ok) return outcome
    const held = existing.get(outcome.md5)
    return {
      ...outcome,
      duplicateOf: held?.id ?? null,
      duplicateIn: held?.owner ?? null,
    }
  })
}

/** A name → owner map, whichever column the owner's name came back in. */
function mapOwner<K extends string>(
  rows: Map<string, { id: number } & Record<K, string>>,
  key: K
): Map<string, { id: number; owner: string }> {
  return new Map([...rows].map(([name, row]) => [name, { id: row.id, owner: row[key] }]))
}
