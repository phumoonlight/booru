/**
 * An artist's example, served by main from `app-cache` (`main/image-protocol.ts`) — the
 * collections' `fullImageUrl` again, for the artist prefix; `grid` is the device-pixel box
 * a tile draws it in, without it the full size the viewer draws.
 */
export const artistImageUrl = (fileName: string, fileExt: string, grid?: string): string =>
  `board-image://artist/${fileName}.${fileExt}${grid ? `?grid=${grid}` : ''}`
