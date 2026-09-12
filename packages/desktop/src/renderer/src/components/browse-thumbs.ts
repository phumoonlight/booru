import { currentBoard } from '../board-store'
import type { Board } from '@common/board'

/**
 * Thumbnails already across the bridge, by file name. `main/manage.ts` caches the bytes
 * on its side, so this saves the IPC round trip and the re-decode rather than the
 * download — enough to make a returning grid paint in one frame instead of filling in
 * tile by tile. Never invalidated: the name is the file's md5, so a name that comes back
 * is the same image by definition.
 */
export const thumbnails = new Map<string, string>()

/**
 * A post's thumbnail, from that cache or from the bridge. Exported because the upload
 * screen's tag import draws the same grid of posts, and a second copy of every image in
 * the window is the one thing this cache exists to avoid.
 */
export async function thumbnailFor(
  fileName: string,
  board: Board = currentBoard()
): Promise<string> {
  const held = thumbnails.get(fileName)
  if (held !== undefined) return held

  const url = await window.api.postThumbnail(fileName, board)
  // A failed fetch answers '' — not remembered, so asking again re-asks the board.
  if (url) thumbnails.set(fileName, url)
  return url
}
