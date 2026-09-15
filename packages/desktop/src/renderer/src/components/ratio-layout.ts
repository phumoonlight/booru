import type { CSSProperties } from 'react'

/**
 * Rows of a fixed height, each image as wide as its own shape makes it — and a ragged
 * right edge, on purpose.
 *
 * It started as the website's justified rows, where each row is stretched to fill the line
 * exactly. That is the right answer for a page and the wrong one here: filling the line
 * means the row's height is whatever the ratios in it happen to need, so a row that drew a
 * wide panorama came out short and every thumbnail beside it shrank with it — comparing
 * two images at sizes decided by what else landed on their line.
 *
 * So nothing grows. `--row-h` is the height of every image on the screen, the width is
 * `ratio × --row-h`, and whatever is left at the end of a line is left there. The gap at
 * the right edge is the price, and it is a much smaller one than a grid whose scale
 * wanders row by row. It was Browse's 📐 Ratio layout; a shelf's grid is what is left of it.
 */

/** Thumbnails are bounded to 768×384 (`@common/imgcmp/for-thumbnail`), so a panorama's
    thumb is at most 2:1 however wide the image is. Laying it out at the image's own ratio
    would reserve width the thumbnail cannot fill. */
const MAX_RATIO = 2

export function ratioOf(width: number, height: number): number {
  return Math.min(width / Math.max(height, 1), MAX_RATIO)
}

/**
 * The tile's width, and nothing else — no grow, no basis, no cap. The height comes from
 * the image box's own `aspectRatio` against this width, which works out to exactly
 * `--row-h` for every card on the screen.
 */
export function itemStyle(width: number, height: number): CSSProperties {
  return { width: `calc(${ratioOf(width, height)} * var(--row-h))` }
}
