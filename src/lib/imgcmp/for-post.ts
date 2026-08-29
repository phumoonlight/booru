import sharp from 'sharp'
import type { Metadata } from 'sharp'

/**
 * Re-encodes the stored post image as lossless AVIF, so the detail view never shows a
 * degraded pixel. It only wins on some inputs — an already-lossy JPEG re-encodes several
 * times larger, and flat-colour PNG often beats it too — so this only offers a candidate;
 * the caller compares it against the uploaded bytes and keeps whichever is smaller.
 *
 * Animated inputs return no candidate at all: sharp would flatten them to frame 1.
 *
 * `effort` is a parameter only so the bench script can sweep it — the upload path
 * always takes the default. See tests/bench/sharp-avif-bench.mts.
 */
export const compressImgForPost = async (meta: Metadata, buffer: Buffer, effort = 9) => {
  const result = {
    ok: true,
    message: 'Success',
    buffer: undefined as Buffer | undefined,
    error: undefined as Error | undefined,
  }
  const isAnimated = (meta.pages ?? 1) > 1
  if (isAnimated) return result // Don't compress animated images (GIF, APNG, WebP, etc.) — they will be stored as-is
  try {
    result.buffer = await sharp(buffer).avif({ effort }).keepIccProfile().toBuffer()
  } catch (err) {
    // Encoder gave up (huge or exotic input) — the uploaded bytes are always a valid answer
    result.ok = false
    result.message = 'Could not re-encode this image as AVIF'
    result.error = err as Error
  }
  return result
}
