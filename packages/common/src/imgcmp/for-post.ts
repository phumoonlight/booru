import sharp from 'sharp'
import type { Metadata } from 'sharp'

/**
 * The stored post image is bounded to 2560 on both sides. Nothing on the site shows a
 * post larger than that — the detail view is an `unoptimized` <Image>, so every pixel
 * past the viewport's is bytes the visitor downloads and throws away — and a 3398x4800
 * upload was costing half a megabyte to display at a fraction of the size.
 *
 * `fit: 'inside'` means it is a bound, not a target: aspect ratio is kept, the longer
 * side lands on 2560, and `withoutEnlargement` leaves anything already smaller alone.
 */
export const POST_MAX_DIMENSION = 2560

/**
 * The floor of the ramp: what an image at or above `POST_QUALITY_FLOOR_AT` is encoded at.
 * Sharp's own default is also 50; it is spelled out here so the number is versioned with
 * the code rather than inherited from whatever sharp ships next. `postQualityFor` has the
 * rest of the curve and the reasoning.
 */
export const POST_QUALITY = 50

/** The ceiling: what an image at or below `POST_QUALITY_MAX_AT` is encoded at. */
export const POST_QUALITY_MAX = 75

/** At or above this on the longer side, quality is `POST_QUALITY`. */
export const POST_QUALITY_FLOOR_AT = 1920

/** At or below this, `POST_QUALITY_MAX`. Between the two, a straight line. */
export const POST_QUALITY_MAX_AT = 1280

/**
 * How hard to squeeze this image, from its own dimensions: 50 at 1920px and up, rising in
 * a straight line to 75 at 1280px and down.
 *
 * Quality 50 is the right trade for something being downscaled towards 2560 — it is
 * losing detail to the resize anyway, and the bytes saved are real. It is the wrong trade
 * for an image that arrives already at the size it will be looked at: nothing is thrown
 * away by the resize, so every artefact the encoder introduces is one the viewer sees at
 * 1:1, and there are far fewer pixels to pay for in the first place.
 *
 * A ramp rather than steps, because there is no size at which the right answer actually
 * jumps — the argument above gets steadily stronger as the image gets smaller, and steps
 * put a visible cliff between two uploads that differ by one pixel.
 *
 * The side that decides is the one the orientation puts the size in — width for a
 * landscape, height for a portrait, and for a square the two are the same number, so
 * "check both" and "check either" are one check. All three are `Math.max(width, height)`,
 * which is why that is what the code says: the longer side, whichever it happens to be.
 *
 * Measured against the *uploaded* dimensions rather than the stored ones, which cannot
 * disagree here — the resize only ever shrinks, and only past `POST_MAX_DIMENSION`, so
 * anything it touches was already over `POST_QUALITY_FLOOR_AT` and lands on the floor
 * either way.
 *
 * Everything above the floor stays honest for free: the caller keeps the AVIF only when
 * it beats the uploaded bytes, and the one case that skips that comparison — an image
 * over `POST_MAX_DIMENSION`, where the re-encode is the only version within bounds — is
 * by definition over 1920 on its longer side and so encoded at `POST_QUALITY`. A
 * top-of-ramp candidate that comes out fatter than its original is therefore always
 * discarded rather than stored.
 */
export function postQualityFor(width = 0, height = 0): number {
  const deciding = Math.max(width, height)
  // Dimensions sharp could not read are not an argument for spending bytes, so an image
  // that cannot say how big it is gets the floor rather than the ceiling.
  if (!deciding || deciding >= POST_QUALITY_FLOOR_AT) return POST_QUALITY
  if (deciding <= POST_QUALITY_MAX_AT) return POST_QUALITY_MAX

  const along =
    (POST_QUALITY_FLOOR_AT - deciding) / (POST_QUALITY_FLOOR_AT - POST_QUALITY_MAX_AT)
  return Math.round(POST_QUALITY + along * (POST_QUALITY_MAX - POST_QUALITY))
}

/**
 * Re-encodes the stored post image as **lossy AVIF**, at the quality `postQualityFor`
 * ramps to from its dimensions, downscaled to fit `POST_MAX_DIMENSION`. The caller compares
 * it against the uploaded bytes and keeps whichever is smaller; above the cap it has no
 * such choice, this being the only version within bounds.
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
 * 42dB. Re-measure with `npm run bench:avif` before moving any of the three.
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
      .avif({ effort, quality: postQualityFor(meta.width, meta.height) })
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
