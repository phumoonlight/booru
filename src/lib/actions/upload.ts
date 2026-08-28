'use server'

import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPostByMd5 } from '@/lib/data/posts'
import {
  POSTS_BUCKET,
  THUMBNAILS_BUCKET,
  postImagePath,
  thumbnailPath,
} from '@/lib/storage'
import { revalidatePath } from 'next/cache'

// Keep under Vercel's server-action body limit; switch to signed upload URLs
// when this first hurts (docs/architecture.md).
const MAX_FILE_SIZE = 8 * 1024 * 1024
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

/**
 * Drop-to-upload: no form, no metadata. Every upload lands as `general` with no
 * tags at all; the uploader adds tags/rating/source later from the edit page.
 */
export async function uploadPost(formData: FormData): Promise<UploadResult> {
  await requireUser()

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Pick an image file' }
  }
  if (file.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `File is too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
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
  const thumb = await sharp(buffer)
    .resize(THUMB_MAX, THUMB_MAX, {
      fit: 'inside',
      withoutEnlargement: true,
      kernel: 'mitchell',
    })
    .avif({ quality: 80, effort: 6, bitdepth: 10 })
    .keepIccProfile()
    .toBuffer()

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
  if (!animated && ext === 'png' && postExt !== 'avif') {
    try {
      const [plain, adaptive] = await Promise.all([
        sharp(buffer)
          .png({ compressionLevel: 9, palette: false })
          .keepIccProfile()
          .toBuffer(),
        sharp(buffer)
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

  // RPC runs on the user's session — auth.uid() must be the uploader, not service role
  const supabase = await createClient()
  const { data: postId, error: rpcError } = await supabase.rpc('create_post_with_tags', {
    p_md5: md5,
    p_file_ext: postExt,
    p_file_size: postBuffer.length,
    p_width: width,
    p_height: height,
    p_rating: 'general',
    p_source_url: '',
    p_tags: [],
  })
  if (rpcError) {
    // Roll back storage so a retry starts clean
    await storage.from(POSTS_BUCKET).remove([postImagePath(md5, postExt)])
    await storage.from(THUMBNAILS_BUCKET).remove([thumbnailPath(md5)])
    return { ok: false, error: `Database insert failed: ${rpcError.message}` }
  }

  revalidatePath('/')
  return { ok: true, postId: postId as number }
}
