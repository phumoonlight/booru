/**
 * Example thumbnails already across the bridge, by file name — the collections' map again,
 * for the artist list. The bytes behind them are shared in main, keyed by md5.
 */
export const thumbnails = new Map<string, string>()

export async function thumbnailFor(fileName: string): Promise<string> {
  const held = thumbnails.get(fileName)
  if (held !== undefined) return held

  const url = await window.api.artistThumbnail(fileName)
  // A failed fetch answers '' — not remembered, so asking again re-asks the bucket.
  if (url) thumbnails.set(fileName, url)
  return url
}
