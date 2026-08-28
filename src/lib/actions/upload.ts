'use server'

import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { z } from 'zod'
import { requireUser } from '@/lib/auth'
import { parseTagInput } from '@/lib/tags'
import { RATINGS } from '@/lib/search'
import { MAX_FILE_SIZE, MAX_FILE_SIZE_LABEL } from '@/lib/upload-limits'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPostWithTags, getPostByMd5 } from '@/lib/data/posts'
import {
  POSTS_BUCKET,
  THUMBNAILS_BUCKET,
  postImagePath,
  thumbnailPath,
} from '@/lib/storage'
import { revalidatePath } from 'next/cache'

// A small file can still decode enormous: a flat 12000x12000 PNG compresses to
// ~400KB, sails past the byte cap, and expands to 412MB in memory. Bytes bound
// the upload, pixels bound the decode.
//
// 20MP is a time budget as much as a memory one. Lossless AVIF costs roughly
// 0.17s per megapixel, so a 49MP upload — still only 375KB, still legal under
// every other limit — spent 9.9s here and lost to the 10s function timeout after
// doing all the work. 20MP holds the whole pipeline near 3.5s, and is still far
// above anything real: a 2000x3000 illustration is 6MP, a 4000x3000 photo 12MP.
const MAX_PIXELS = 20_000_000
const THUMB_MAX = 400

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

export type UploadResult =
  | { ok: true; postId: number }
  | { ok: false; error: string; existingPostId?: number }

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
 * Creates one post from one staged file. The uploader reviews and tags each image
 * before submitting, so `tags`, `rating` and `source_url` arrive with the bytes;
 * they still default to an untagged `general` post when the caller omits them.
 *
 * One file per call: each image is its own post, its own failure, and its own row
 * in the queue's progress list.
 */
export async function uploadPost(formData: FormData): Promise<UploadResult> {
  const uploader = await requireUser()

  const metadata = metadataSchema.safeParse({
    tags: formData.get('tags') ?? '',
    rating: formData.get('rating') ?? 'general',
    source_url: formData.get('source_url') ?? '',
  })
  if (!metadata.success) {
    return { ok: false, error: metadata.error.issues[0].message }
  }
  const { tags, invalid } = parseTagInput(metadata.data.tags)
  if (invalid.length > 0) {
    return {
      ok: false,
      error: `Invalid tags (lowercase a-z 0-9 _ ( ) . - only): ${invalid.join(', ')}`,
    }
  }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Pick an image file' }
  }
  if (file.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `File is too large (max ${MAX_FILE_SIZE_LABEL})`,
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  let width: number | undefined
  let height: number | undefined
  let ext: string | undefined
  let animated = false
  try {
    const meta = await sharp(buffer).metadata()
    // EXIF orientations 5-8 turn the image a quarter turn, and metadata() reports
    // the size *before* that turn. Both ends of the pipeline show it turned —
    // browsers apply the tag to a stored original, and sharp bakes the rotation
    // into anything it re-encodes — so the recorded size has to be swapped to match.
    const quarterTurned = (meta.orientation ?? 1) >= 5
    width = quarterTurned ? meta.height : meta.width
    height = quarterTurned ? meta.width : meta.height
    ext = meta.format ? FORMAT_TO_EXT[meta.format] : undefined
    animated = (meta.pages ?? 1) > 1
  } catch {
    return { ok: false, error: 'File is not a readable image' }
  }
  if (!ext || !width || !height) {
    return { ok: false, error: 'Unsupported format (jpg/png/gif/webp/avif only)' }
  }
  // Nothing has been decoded yet — metadata() only reads headers — so this is the
  // last point where an oversized image can be turned away for free.
  if (width * height > MAX_PIXELS) {
    return {
      ok: false,
      error: `Image has too many pixels (max ${MAX_PIXELS / 1_000_000}MP)`,
    }
  }

  // md5 identifies the *uploaded* bytes, so dedupe stays stable no matter what
  // we re-encode below. Storage paths derive from it either way.
  const md5 = createHash('md5').update(buffer).digest('hex')

  const existing = await getPostByMd5(md5)
  if (existing) {
    return {
      ok: false,
      error: 'This image already exists',
      existingPostId: existing.id,
    }
  }

  // Thumbnail: lossy AVIF. AVIF is 4:4:4 by default where WebP lossy is stuck at
  // 4:2:0, so coloured line art and text edges survive; 10-bit costs nothing and
  // stops smooth gradients banding. First frame only for animated inputs.
  //
  // `mitchell` over the default `lanczos3`: lanczos rings on the hard edges this
  // site is full of, haloing every line, and the extra high-frequency detail also
  // encodes larger. Measured on line art — peak overshoot +19 levels vs +3, and
  // 15% more bytes.
  //
  // Unlike the lossless attempts below there is no fallback here — a post with no
  // thumbnail has nothing to show in the grid — so a failure ends the upload with
  // the same error shape as everything else rather than throwing out of the action.
  let thumb: Buffer
  try {
    thumb = await sharp(buffer)
      .resize(THUMB_MAX, THUMB_MAX, {
        fit: 'inside',
        withoutEnlargement: true,
        kernel: 'mitchell',
      })
      .avif({ quality: 80, effort: 6, bitdepth: 10 })
      .keepIccProfile()
      .toBuffer()
  } catch {
    return { ok: false, error: 'Could not build a thumbnail for this image' }
  }

  // Post image: lossless AVIF, so the detail view never shows a degraded pixel.
  // It only wins on some inputs; an already-lossy JPEG re-encodes several times
  // larger, and flat-colour PNG often beats it too — either way the upload is
  // stored untouched unless AVIF actually comes out smaller.
  // Animated inputs are skipped outright: sharp would flatten them to frame 1.
  let postBuffer = buffer
  let postExt = ext
  if (!animated) {
    try {
      const avif = await sharp(buffer)
        .avif({ lossless: true, effort: 4 })
        .keepIccProfile()
        .toBuffer()
      if (avif.length < postBuffer.length) {
        postBuffer = avif
        postExt = 'avif'
      }
    } catch {
      // Encoder gave up (huge or exotic input) — keep the upload as-is
    }
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
        sharp(buffer)
          .rotate()
          .png({ compressionLevel: 9, palette: false })
          .keepIccProfile()
          .toBuffer(),
        sharp(buffer)
          .rotate()
          .png({ compressionLevel: 9, palette: false, adaptiveFiltering: true })
          .keepIccProfile()
          .toBuffer(),
      ])
      const best = adaptive.length < plain.length ? adaptive : plain
      if (best.length < postBuffer.length) {
        postBuffer = best
      }
    } catch {
      // Same fallback as above — the upload is always a valid answer
    }
  }

  // Storage writes need the service-role client (RLS floor is signed-in-only anyway)
  const storage = createAdminClient().storage
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
    .upload(thumbnailPath(md5), thumb, {
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
    postId = await createPostWithTags(uploader.id, {
      md5,
      file_ext: postExt,
      file_size: postBuffer.length,
      width,
      height,
      rating: metadata.data.rating,
      source_url: metadata.data.source_url,
      tags,
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

  revalidatePath('/')
  return { ok: true, postId }
}
