import type { UploadLimits } from '@web/lib/upload/pipeline'

/**
 * The desktop uploader's ceilings. Both numbers in the web's `lib/upload-limits.ts` are
 * Vercel's, not the pipeline's: 4MB because a serverless request body is capped at
 * 4.5MB, and 20MP because lossless AVIF costs ~0.17s/MP and the function dies at 10s.
 * Neither applies to a process on your own machine writing straight to Supabase
 * Storage, which is the whole reason this app exists.
 *
 * 50MB is Supabase Storage's default per-file limit for a project. Raising it further
 * means raising it in the project settings first, or the upload 413s after the
 * compression has already been paid for.
 *
 * 100MP is a memory bound rather than a time one — an RGBA decode of that is ~400MB,
 * and libvips holds one while it encodes. The lossless AVIF pass at that size takes
 * around twenty seconds; the queue shows which file it is on, and nothing times out.
 */
export const MAX_FILE_SIZE = 50 * 1024 * 1024
export const MAX_FILE_SIZE_LABEL = `${MAX_FILE_SIZE / 1024 / 1024}MB`
export const MAX_PIXELS = 100_000_000

export const DESKTOP_UPLOAD_LIMITS: UploadLimits = {
  maxFileSize: MAX_FILE_SIZE,
  maxFileSizeLabel: MAX_FILE_SIZE_LABEL,
  maxPixels: MAX_PIXELS,
}
