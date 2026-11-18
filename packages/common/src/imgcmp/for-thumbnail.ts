import sharp from 'sharp'

// A thumbnail is fitted inside 1024x768, then raised until neither side is under 360.
// The two bounds only disagree on an extreme shape — past 1024:360 wide or 360:768 tall,
// fitting inside the box leaves the short side under 360 — and there the floor wins: a
// sliver of a panorama is unreadable in a grid that sizes by row height, so the long
// side is let past its cap instead. Nothing is ever enlarged past the source; an image
// already under the floor is thumbnailed at its own size.
//
// Anything already stored keeps the size it was encoded at; these constants only apply
// at upload.
export const THUMB_MIN_HEIGHT = 360
export const THUMB_MAX_HEIGHT = 768
export const THUMB_MIN_WIDTH = 360
export const THUMB_MAX_WIDTH = 1024

export const THUMB_QUALITY = 45

/** The thumbnail's size for a source of `width`x`height`, aspect ratio kept. */
export function thumbSizeFor(width: number, height: number) {
  const fit = Math.min(THUMB_MAX_WIDTH / width, THUMB_MAX_HEIGHT / height)
  const floor = Math.max(THUMB_MIN_WIDTH / width, THUMB_MIN_HEIGHT / height)
  const scale = Math.min(1, Math.max(fit, floor))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * Thumbnail: lossy AVIF. AVIF is 4:4:4 by default where WebP lossy is stuck at 4:2:0, so
 * coloured line art and text edges survive; 10-bit costs nothing and stops smooth
 * gradients banding. First frame only for animated inputs.
 *
 * `mitchell` over the default `lanczos3`: lanczos rings on the hard edges this site is
 * full of, haloing every line, and the extra high-frequency detail also encodes larger.
 * Measured on line art — peak overshoot +19 levels vs +3, and 15% more bytes.
 *
 * `effort` is a parameter only so `npm run bench:avif` can sweep it; every caller takes
 * the default, and a thumbnail is small enough that the highest setting is affordable
 * where it would not be on the full image.
 */
export const compressImgForThumbnail = async (buffer: Buffer, effort = 9) => {
  const result = {
    ok: true,
    message: 'Success',
    buffer: undefined as Buffer | undefined,
    error: undefined as Error | undefined,
  }
  try {
    // The bounds are about the image as it is seen, so they are measured against the
    // turned one — orientations 5-8 swap the two sides — and `.rotate()` turns it before
    // the resize. Without it sharp fits the box to the stored pixels and turns afterwards,
    // which put a 2000x1000 photo tagged 6 at 192x384 instead of 384x768.
    const meta = await sharp(buffer).metadata()
    // An animation's `height` can be every frame stacked; `pageHeight` is one frame.
    const frameHeight = meta.pageHeight ?? meta.height ?? THUMB_MAX_HEIGHT
    const frameWidth = meta.width ?? THUMB_MAX_WIDTH
    const quarterTurned = (meta.orientation ?? 1) >= 5
    const size = quarterTurned
      ? thumbSizeFor(frameHeight, frameWidth)
      : thumbSizeFor(frameWidth, frameHeight)
    result.buffer = await sharp(buffer)
      .rotate()
      .resize({
        fit: 'inside',
        kernel: 'mitchell',
        withoutEnlargement: true,
        ...size,
      })
      .avif({ effort, quality: THUMB_QUALITY })
      .keepIccProfile()
      .toBuffer()
  } catch (err) {
    result.ok = false
    result.message = 'Could not build a thumbnail for this image'
    result.error = err as Error
  }
  return result
}
