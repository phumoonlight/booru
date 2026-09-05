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
 * Lossy, and deliberately so — see `compressImgForPost` below. Sharp's own default is
 * also 50; it is spelled out here so the number is versioned with the code rather than
 * inherited from whatever sharp ships next.
 */
export const POST_QUALITY = 50

/**
 * Re-encodes the stored post image as **lossy AVIF at quality 50**, downscaled to fit
 * `POST_MAX_DIMENSION`. The caller compares it against the uploaded bytes and keeps
 * whichever is smaller; above the cap it has no such choice, this being the only version
 * within bounds.
 *
 * `quality` is written out rather than left to sharp's default, which is what it was for
 * a long time — and the file said "lossless" while doing it, which is how nobody noticed
 * the detail view was serving a re-encode. An implicit default is a number no one can
 * see and no one is deciding.
 *
 * Lossless was measured and rejected: on a 1.9MB JPEG it produces 3.6MB, so the
 * candidate loses the size comparison and the original is stored instead — correct, but
 * it means the AVIF path only ever fires on inputs that were already cheap, and every
 * photo keeps its uploaded bytes. Quality 50 is 215kB at 35dB; quality 80 is 548kB at
 * 42dB if the softness ever becomes the complaint. Re-measure with
 * `npm run bench:avif` before moving it.
 *
 * `mitchell` over the default `lanczos3` for the same measured reason as the thumbnail
 * (see for-thumbnail.ts): lanczos rings on hard edges, and that ringing is extra
 * high-frequency detail the encoder then spends bits on.
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
      .avif({ effort, quality: POST_QUALITY })
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
