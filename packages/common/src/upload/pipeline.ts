import { createHash } from 'node:crypto'
import sharp, { type Metadata } from 'sharp'
import { z } from 'zod'
import { POST_MAX_DIMENSION, compressImgForPost } from '@common/imgcmp/for-post'
import { compressImgForThumbnail } from '@common/imgcmp/for-thumbnail'
import { createPostWithTags, findPostIdByMd5 } from '@common/data/shared'
import { POSTS_BUCKET, THUMBNAILS_BUCKET, postImagePath, thumbnailPath } from '@common/storage'
import { RATINGS, type Rating } from '@common/search'
import { parseTagInput } from '@common/tags'
import type { BooruClient } from '@common/supabase/types'

/**
 * One image in, one post out: validate, compress, store, insert, and unwind the whole
 * thing if any of that fails.
 *
 * This is the half of the upload that has nothing to do with how the bytes arrived. The
 * web hands it a server action's `FormData` file (`src/lib/actions/upload.ts`); the desktop
 * uploader hands it a file read off disk (`packages/desktop`), because the compression
 * below is the CPU work that a free serverless tier is worst at. Neither owns it, so
 * neither can drift from the other on what a post is.
 *
 * What stays with the caller: authentication, whatever framework-shaped parsing gets the
 * bytes out of a request, cache revalidation, and the limits — those are a property of
 * where the code runs, not of the pipeline (see `limits` below).
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
 * Where the ceilings come from is the caller's business. The web's are Vercel's — a
 * 4.5MB request body and a 10s function timeout (`src/lib/upload-limits.ts`) — and the
 * desktop uploader's are Supabase Storage's and its own patience
 * (`packages/desktop/src/main/limits.ts`). Nothing in here has an opinion about either.
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
 * `supabase` is the uploader's session — the row is written on it so RLS records who
 * uploaded. `admin` is the service role, for the storage writes and the counter
 * recounts, neither of which a user session is entitled to do.
 */
export async function createPostFromImage(
  supabase: BooruClient,
  admin: BooruClient,
  uploaderId: string,
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

  // md5 identifies the *uploaded* bytes, so dedupe stays stable no matter what
  // we re-encode below. Storage paths derive from it either way.
  const md5 = createHash('md5').update(bytes).digest('hex')

  const existingPostId = await findPostIdByMd5(supabase, md5)
  if (existingPostId !== null) {
    return { ok: false, error: 'This image already exists', existingPostId }
  }

  // Unlike the lossless attempts below there is no fallback here — a post with no
  // thumbnail has nothing to show in the grid — so a failure ends the upload with
  // the same error shape as everything else rather than throwing out of the caller.
  const thumbResult = await compressImgForThumbnail(bytes)
  if (!thumbResult.buffer) {
    return { ok: false, error: thumbResult.message }
  }

  // Post image: the lossless AVIF candidate is kept only when it actually comes out
  // smaller than the uploaded bytes, which for JPEG and flat-colour PNG it usually
  // does not. A failed encode is not fatal — the upload itself is always storable.
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
      `[upload ${md5.slice(0, 8)}] lossless avif: ${ext} ${kb(bytes.length)} ${width}x${height}` +
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
      `[upload ${md5.slice(0, 8)}] lossless avif: encoder failed — ` +
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

  // Storage writes need the service-role client (RLS floor is signed-in-only anyway)
  const storage = admin.storage
  const postUpload = await storage
    .from(POSTS_BUCKET)
    .upload(postImagePath(md5, postExt), postBuffer, {
      contentType: CONTENT_TYPES[postExt],
      upsert: false,
    })
  if (postUpload.error) {
    return { ok: false, error: `Storage upload failed: ${postUpload.error.message}` }
  }
  const thumbUpload = await storage
    .from(THUMBNAILS_BUCKET)
    .upload(thumbnailPath(md5), thumbResult.buffer, {
      contentType: 'image/avif',
      upsert: true,
    })
  if (thumbUpload.error) {
    await storage.from(POSTS_BUCKET).remove([postImagePath(md5, postExt)])
    return { ok: false, error: `Thumbnail upload failed: ${thumbUpload.error.message}` }
  }

  // Written on the user's session, not the service role — the row records the uploader
  let postId: number
  try {
    postId = await createPostWithTags(supabase, admin, uploaderId, {
      md5,
      file_ext: postExt,
      file_size: postBuffer.length,
      width: postWidth,
      height: postHeight,
      rating: metadata.rating,
      source_url: metadata.sourceUrl,
      tags: metadata.tags,
    })
  } catch (error) {
    // Roll back storage so a retry starts clean
    await storage.from(POSTS_BUCKET).remove([postImagePath(md5, postExt)])
    await storage.from(THUMBNAILS_BUCKET).remove([thumbnailPath(md5)])
    return {
      ok: false,
      error: `Database insert failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  return { ok: true, postId }
}
