import sharp from 'sharp'
import type { Metadata } from 'sharp'

/**
 * The stored post image is bounded to 2048 on both sides. Nothing on the site shows a
 * post larger than that — the detail view is an `unoptimized` <Image>, so every pixel
 * past the viewport's is bytes the visitor downloads and throws away — and a 3398x4800
 * upload was costing half a megabyte to display at a fraction of the size.
 *
 * `fit: 'inside'` means it is a bound, not a target: aspect ratio is kept, the longer
 * side lands on 2048, and `withoutEnlargement` leaves anything already smaller alone.
 */
export const POST_MAX_DIMENSION = 2048

/**
 * Re-encodes the stored post image as lossless AVIF, downscaled to fit
 * `POST_MAX_DIMENSION`, so the detail view never shows a degraded pixel. Below the cap
 * it only wins on some inputs — an already-lossy JPEG re-encodes several times larger,
 * and flat-colour PNG often beats it too — so this only offers a candidate; the caller
 * compares it against the uploaded bytes and keeps whichever is smaller. Above the cap
 * the caller has no such choice: this is the only version within bounds.
 *
 * `mitchell` over the default `lanczos3` for the same measured reason as the thumbnail
 * (see for-thumbnail.ts): lanczos rings on hard edges, and the ringing is extra
 * high-frequency detail a lossless encode then has to store in full.
 *
 * Animated inputs return no candidate at all: sharp would flatten them to frame 1. An
 * oversized animation is therefore stored at its uploaded size.
 *
 * `effort` is a parameter only so the bench script can sweep it — the upload path
 * always takes the default. See tests/bench/sharp-avif-bench.mts.
 */
export const compressImgForPost = async (meta: Metadata, buffer: Buffer, effort = 9) => {
  const result = {
    ok: true,
    message: 'Success',
    buffer: undefined as Buffer | undefined,
    // The stored image's own size, which is what the post row has to record once a
    // downscale is in play — the uploaded dimensions no longer describe the file.
    width: undefined as number | undefined,
    height: undefined as number | undefined,
    error: undefined as Error | undefined,
  }
  const isAnimated = (meta.pages ?? 1) > 1
  if (isAnimated) return result // Don't compress animated images (GIF, APNG, WebP, etc.) — they will be stored as-is
  try {
    const { data, info } = await sharp(buffer)
      .resize({
        fit: 'inside',
        kernel: 'mitchell',
        withoutEnlargement: true,
        width: POST_MAX_DIMENSION,
        height: POST_MAX_DIMENSION,
      })
      .avif({ effort })
      .keepIccProfile()
      .toBuffer({ resolveWithObject: true })
    result.buffer = data
    result.width = info.width
    result.height = info.height
  } catch (err) {
    // Encoder gave up (huge or exotic input) — the uploaded bytes are always a valid answer
    result.ok = false
    result.message = 'Could not re-encode this image as AVIF'
    result.error = err as Error
  }
  return result
}
