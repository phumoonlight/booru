/**
 * Thumbnails already across the bridge, by file name. Separate from Browse's map only
 * because that one is a module-level `const` in another file; the bytes behind them are
 * shared in main, where the cache is keyed by md5 and so is right for both.
 */
export const thumbnails = new Map<string, string>()

export async function thumbnailFor(fileName: string): Promise<string> {
  const held = thumbnails.get(fileName)
  if (held !== undefined) return held

  const url = await window.api.collectionThumbnail(fileName)
  // A failed fetch answers '' — not remembered, so asking again re-asks the board.
  if (url) thumbnails.set(fileName, url)
  return url
}
