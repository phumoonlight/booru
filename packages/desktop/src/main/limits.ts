import type { UploadLimits } from '@common/upload/pipeline'

/**
 * The uploader's ceilings, and the only ones left. The website's were Vercel's rather
 * than the pipeline's — 4MB because a serverless request body is capped at 4.5MB, and
 * 20MP because the AVIF pass costs ~0.17s/MP and the function dies at 10s — and neither
 * applies to a process on your own machine writing straight to a bucket, which is the
 * whole reason this app exists.
 *
 * 50MB was Supabase Storage's per-file default and is now nobody's but ours: R2 takes a
 * single `PutObject` up to 5GB. It stays because it is a sane thing to refuse rather than
 * because anything refuses it for us — a 50MB image is a mistake far more often than an
 * intention, and finding out after the compression has been paid for is the wrong moment.
 *
 * 100MP is a memory bound rather than a time one — an RGBA decode of that is ~400MB, and
 * libvips holds one while it encodes. The AVIF pass at that size takes around twenty
 * seconds; the form says what it is doing, and nothing times out.
 */
export const MAX_FILE_SIZE = 50 * 1024 * 1024
export const MAX_FILE_SIZE_LABEL = `${MAX_FILE_SIZE / 1024 / 1024}MB`
export const MAX_PIXELS = 100_000_000

export const DESKTOP_UPLOAD_LIMITS: UploadLimits = {
  maxFileSize: MAX_FILE_SIZE,
  maxFileSizeLabel: MAX_FILE_SIZE_LABEL,
  maxPixels: MAX_PIXELS,
}
