/**
 * A shelf image, served by main from its disk cache (`main/image-protocol.ts`). Chromium
 * holds the decoded picture, so there is no map of them here.
 *
 * `grid` is the device-pixel box a tile draws it in, `<w>x<h>` (`useDrawnBox`): main resizes
 * and crops the full size to exactly that once (`main/grid-image.ts`), because any scaling
 * left to Chromium came out jagged. Without it, the stored full size, for the viewer.
 */
export const fullImageUrl = (fileName: string, fileExt: string, grid?: string): string =>
  `board-image://collection/${fileName}.${fileExt}${grid ? `?grid=${grid}` : ''}`
