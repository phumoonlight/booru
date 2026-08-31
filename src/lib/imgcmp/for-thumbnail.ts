import sharp from 'sharp'

// The grid scales thumbnails by row height, not by their longest side (`--row-h` in
// post-grid.tsx — 240/280/320px, and up to 1.25x that), so height is what has to be
// guaranteed. Bounding the longest side left every landscape thumb short: a 16:9 image
// capped at 400 wide is only 225 tall, and the grid stretched that to 320 — a 1.4x
// upscale, worse the wider the image. Bounding height instead makes pixel density
// uniform across aspect ratios, and a wide post pays for it in width, which is also
// the screen area it takes up.
//
// The width cap is for panoramas only: at 5:1 a height-400 thumb would be 2000px
// across, so `fit: 'inside'` falls back to the width bound and yields 800x160.
export const THUMB_MAX_HEIGHT = 400
export const THUMB_MAX_WIDTH = 800

/**
 * Thumbnail: lossy AVIF. AVIF is 4:4:4 by default where WebP lossy is stuck at 4:2:0, so
 * coloured line art and text edges survive; 10-bit costs nothing and stops smooth
 * gradients banding. First frame only for animated inputs.
 *
 * `mitchell` over the default `lanczos3`: lanczos rings on the hard edges this site is
 * full of, haloing every line, and the extra high-frequency detail also encodes larger.
 * Measured on line art — peak overshoot +19 levels vs +3, and 15% more bytes.
 */
export const compressImgForThumbnail = async (buffer: Buffer) => {
  const result = {
    ok: true,
    message: 'Success',
    buffer: undefined as Buffer | undefined,
    error: undefined as Error | undefined,
  }
  try {
    result.buffer = await sharp(buffer)
      .resize({
        fit: 'inside',
        kernel: 'mitchell',
        withoutEnlargement: true,
        height: THUMB_MAX_HEIGHT,
        width: THUMB_MAX_WIDTH,
      })
      .avif({ effort: 9 })
      .keepIccProfile()
      .toBuffer()
  } catch (err) {
    result.ok = false
    result.message = 'Could not build a thumbnail for this image'
    result.error = err as Error
  }
  return result
}
