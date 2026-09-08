import { createHash } from 'node:crypto'
import sharp, { type Metadata } from 'sharp'
import { z } from 'zod'
import { POST_MAX_DIMENSION, compressImgForPost } from '@common/imgcmp/for-post'
import { compressImgForThumbnail } from '@common/imgcmp/for-thumbnail'
import { createPostWithTags, findPostIdByFileName, resolveTagIds } from '@common/data/shared'
import { postImagePath, thumbnailPath, type ObjectStore } from '@common/storage'
import { RATINGS, type Rating } from '@common/search'
import { parseTagInput } from '@common/tags'
import type { DbPool } from '@common/db'

/**
 * One image in, one post out: validate, compress, store, insert, and put back whatever
 * landed if any of that fails.
 *
 * This is the half of the upload that has nothing to do with how the bytes arrived or
 * where they are going. The desktop app hands it a file read off disk, a database handle
 * and a bucket; it builds none of the three, which is what lets it compile in Electron's
 * main process (invariant 3).
 *
 * What stays with the caller: whatever gets the bytes off disk, and the limits — those
 * are a property of where the code runs, not of the pipeline (see `limits` below).
 */

const FORMAT_TO_EXT: Record<string, string> = {
  jpeg: 'jpg',
  png: 'png',
  gif: 'gif',
  webp: 'webp',
  avif: 'avif',
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
}

// Debug logging for the re-encode branches below. The whole point of those branches is
// that the winner depends on the input, so the only way to tune them is to watch real
// uploads lose — one line per attempt, keyed by the md5 so concurrent uploads stay
// legible.
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)}kB`
const pct = (candidate: number, baseline: number) =>
  `${candidate < baseline ? '-' : '+'}${((Math.abs(candidate - baseline) / baseline) * 100).toFixed(1)}%`

export type UploadResult =
  | { ok: true; postId: number }
  | { ok: false; error: string; existingPostId?: number }

/**
 * Where the ceilings come from is the caller's business — the desktop app's are its own
 * (`packages/desktop/src/main/limits.ts`) and now the only ones, the website having
 * stopped taking uploads. Nothing in here has an opinion about them.
 */
export type UploadLimits = {
  maxFileSize: number
  maxFileSizeLabel: string
  maxPixels: number
}

export type PostMetadata = {
  tags: string[]
  rating: Rating
  sourceUrl: string
}

// Same shape the edit form posts, minus the id — a staged file carries the metadata
// it will be created with, so an upload never has to be fixed up afterwards.
const metadataSchema = z.object({
  tags: z.string(),
  rating: z.enum(RATINGS),
  source_url: z
    .string()
    .trim()
    .pipe(z.union([z.literal(''), z.url('Source must be a valid URL')])),
})

/**
 * Validates the three fields staged beside an image and normalizes the tag string into
 * a list. Shared so the web form and the desktop queue reject the same input with the
 * same words — the tag charset in particular is only spelled once.
 */
export function parsePostMetadata(
  raw: unknown
): { ok: true; metadata: PostMetadata } | { ok: false; error: string } {
  const parsed = metadataSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const { tags, invalid } = parseTagInput(parsed.data.tags)
  if (invalid.length > 0) {
    return {
      ok: false,
      error: `Invalid tags (lowercase a-z 0-9 _ ( ) . - only): ${invalid.join(', ')}`,
    }
  }

  return {
    ok: true,
    metadata: { tags, rating: parsed.data.rating, sourceUrl: parsed.data.source_url },
  }
}

/**
 * Creates one post from one image's bytes.
 *
 * Two handles, and it builds neither: the database, and somewhere to put the files. They
 * were one Supabase client that was both — a bucket and a schema behind one key — and
 * splitting them is what a separate database and a separate bucket made honest. Only the
 * desktop app holds either, since it is the only thing that writes.
 */
export async function createPostFromImage(
  db: DbPool,
  store: ObjectStore,
  bytes: Buffer,
  metadata: PostMetadata,
  limits: UploadLimits
): Promise<UploadResult> {
  if (bytes.length === 0) {
    return { ok: false, error: 'Pick an image file' }
  }
  if (bytes.length > limits.maxFileSize) {
    return { ok: false, error: `File is too large (max ${limits.maxFileSizeLabel})` }
  }

  let meta: Metadata
  try {
    meta = await sharp(bytes).metadata()
  } catch {
    return { ok: false, error: 'File is not a readable image' }
  }
  // EXIF orientations 5-8 turn the image a quarter turn, and metadata() reports
  // the size *before* that turn. Both ends of the pipeline show it turned —
  // browsers apply the tag to a stored original, and sharp bakes the rotation
  // into anything it re-encodes — so the recorded size has to be swapped to match.
  const quarterTurned = (meta.orientation ?? 1) >= 5
  const width = quarterTurned ? meta.height : meta.width
  const height = quarterTurned ? meta.width : meta.height
  const ext = meta.format ? FORMAT_TO_EXT[meta.format] : undefined
  const animated = (meta.pages ?? 1) > 1
  if (!ext || !width || !height) {
    return { ok: false, error: 'Unsupported format (jpg/png/gif/webp/avif only)' }
  }
  // Nothing has been decoded yet — metadata() only reads headers — so this is the
  // last point where an oversized image can be turned away for free.
  if (width * height > limits.maxPixels) {
    return {
      ok: false,
      error: `Image has too many pixels (max ${limits.maxPixels / 1_000_000}MP)`,
    }
  }

  // The md5 of the *uploaded* bytes, which becomes `posts.file_name` and both stored
  // files' names. Hashing what came in rather than what gets stored is what keeps dedupe
  // stable no matter what
  // we re-encode below. Storage paths derive from it either way.
  const md5 = createHash('md5').update(bytes).digest('hex')

  const existingPostId = await findPostIdByFileName(db, md5)
  if (existingPostId !== null) {
    return { ok: false, error: 'This image already exists', existingPostId }
  }

  // A tag the board doesn't have fails the insert at the bottom of this function, which
  // by then has cost a full encode and two storage uploads to undo. The same question
  // asked here, next to the other one this function asks the board, costs one small
  // select on the way past and turns a mistyped or stale tag into an error before any
  // pixels are decoded. The insert still checks — this is an early out, not the rule.
  try {
    await resolveTagIds(db, metadata.tags)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown tags' }
  }

  // Unlike the post image below there is no fallback here — a post with no
  // thumbnail has nothing to show in the grid — so a failure ends the upload with
  // the same error shape as everything else rather than throwing out of the caller.
  const thumbResult = await compressImgForThumbnail(bytes)
  if (!thumbResult.buffer) {
    return { ok: false, error: thumbResult.message }
  }

  // Post image: the AVIF candidate is kept only when it actually comes out smaller than
  // the uploaded bytes. It is lossy (quality 50), so it usually does — the comparison
  // earns its keep on inputs that were already small or already AVIF. A failed encode is
  // not fatal: the upload itself is always storable.
  //
  // Oversized is the exception: past POST_MAX_DIMENSION the candidate is not competing
  // on bytes at all, it is the only version inside the cap, so it is kept however it
  // measures. The one input that can still land over the cap is an animation, which
  // the encoder declines rather than flatten to frame 1.
  let postBuffer: Buffer = bytes
  let postExt = ext
  let postWidth = width
  let postHeight = height
  const oversized = width > POST_MAX_DIMENSION || height > POST_MAX_DIMENSION
  const startedAt = Date.now()
  const postResult = await compressImgForPost(meta, bytes)
  if (postResult.buffer) {
    const avif = postResult.buffer
    const won = oversized || avif.length < postBuffer.length
    const outWidth = postResult.width ?? width
    const outHeight = postResult.height ?? height
    console.log(
      `[upload ${md5.slice(0, 8)}] post avif: ${ext} ${kb(bytes.length)} ${width}x${height}` +
        ` -> avif ${kb(avif.length)} ${outWidth}x${outHeight} ` +
        `(${pct(avif.length, bytes.length)}, ${Date.now() - startedAt}ms) — ` +
        `${won ? (oversized ? 'kept, over cap' : 'kept') : 'discarded'}`
    )
    if (won) {
      postBuffer = avif
      postExt = 'avif'
      postWidth = outWidth
      postHeight = outHeight
    }
  } else if (!postResult.ok) {
    console.log(
      `[upload ${md5.slice(0, 8)}] post avif: encoder failed — ` +
        `${postResult.error?.message ?? postResult.message}`
    )
  }

  // AVIF lost and the upload is a PNG: re-deflate it instead. Same pixels, just a
  // better-packed PNG. Adaptive filtering wins big on photographic content and
  // loses on flat colour, so both are tried and the smaller one kept.
  // `palette` must stay false — `effort` alone silently turns on quantisation.
  //
  // `.rotate()` applies the EXIF orientation rather than turning by any angle.
  // libvips does that on its own when it resizes or changes format, but PNG to
  // PNG does neither: the pixels would pass through untouched while the tag is
  // dropped on output, losing the rotation for good. Every other branch here
  // ends up turned, so this one has to be told to.
  if (!animated && ext === 'png' && postExt !== 'avif') {
    try {
      const [plain, adaptive] = await Promise.all([
        sharp(bytes)
          .rotate()
          .png({ compressionLevel: 9, palette: false })
          .keepIccProfile()
          .toBuffer(),
        sharp(bytes)
          .rotate()
          .png({ compressionLevel: 9, palette: false, adaptiveFiltering: true })
          .keepIccProfile()
          .toBuffer(),
      ])
      const best = adaptive.length < plain.length ? adaptive : plain
      const won = best.length < postBuffer.length
      console.log(
        `[upload ${md5.slice(0, 8)}] png re-deflate: original ${kb(bytes.length)} -> ` +
          `plain ${kb(plain.length)} / adaptive ${kb(adaptive.length)}, best ` +
          `${kb(best.length)} (${pct(best.length, bytes.length)}) — ` +
          `${won ? 'kept' : 'discarded'}`
      )
      if (won) {
        postBuffer = best
      }
    } catch (error) {
      // Same fallback as above — the upload is always a valid answer
      console.log(
        `[upload ${md5.slice(0, 8)}] png re-deflate: failed — ` +
          `${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  console.log(
    `[upload ${md5.slice(0, 8)}] stored: uploaded ${ext} ${kb(bytes.length)} -> ` +
      `${postExt} ${kb(postBuffer.length)} (${pct(postBuffer.length, bytes.length)}), ` +
      `thumb ${kb(thumbResult.buffer.length)}`
  )

  // The files go in before the row, because the row is what makes them findable: an
  // object nothing points at is invisible litter, where a row pointing at a missing
  // object is a broken image on the board.
  const imagePath = postImagePath(md5, postExt)
  try {
    await store.put(imagePath, postBuffer, CONTENT_TYPES[postExt])
  } catch (error) {
    return { ok: false, error: `Storage upload failed: ${message(error)}` }
  }

  try {
    await store.put(thumbnailPath(md5), thumbResult.buffer, 'image/avif')
  } catch (error) {
    await store.remove(imagePath)
    return { ok: false, error: `Thumbnail upload failed: ${message(error)}` }
  }

  let postId: number
  try {
    postId = await createPostWithTags(db, {
      file_name: md5,
      file_ext: postExt,
      file_size: postBuffer.length,
      width: postWidth,
      height: postHeight,
      rating: metadata.rating,
      source_url: metadata.sourceUrl,
      tags: metadata.tags,
    })
  } catch (error) {
    // The write itself is a transaction now, so there is no half-made post to undo —
    // only the two objects, which nothing would ever ask for again. Removing them is
    // what keeps a retry of the same image starting clean rather than uploading over
    // itself.
    await store.remove(imagePath)
    await store.remove(thumbnailPath(md5))
    return { ok: false, error: `Database insert failed: ${message(error)}` }
  }

  return { ok: true, postId }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
