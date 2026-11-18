import { getCollectionPost } from '@common/data/collections'
import { compressImgForThumbnail } from '@common/imgcmp/for-thumbnail'
import { collectionImagePath, collectionThumbnailPath } from '@common/storage'
import { boardDb } from './db'
import { boardStore } from './r2'
import { storedImage } from './image-cache'
import { logged } from './activity-log'
import { boardImageUrl, loadConfig } from './config'
import { purgeCdnUrls } from './cdn-purge'
import type { Outcome } from './collections'

/**
 * Re-cuts one image's thumbnail from its stored full size and writes it back over the old
 * one, under the same name — for an image uploaded before the thumbnail's bounds changed.
 *
 * The stored image is the source because it is the best copy the board has: the uploaded
 * bytes were never kept unless they won, and when the AVIF won it is what survived. No row
 * changes — the thumbnail's size is recorded nowhere, its path derives from `file_name` — so
 * nothing here drops the collection cache, and the desktop app draws its grid from the full
 * size anyway (`main/grid-image.ts`).
 *
 * Thumbnails are written `immutable` for a year (`main/r2.ts`), so anything already holding
 * the old one has no reason to ask again. Cloudflare's edge is purged of it afterwards when
 * the build has a purge token (`main/cdn-purge.ts`); a browser that has it keeps it.
 */
export async function rebuildCollectionThumbnail(id: number): Promise<Outcome> {
  const db = boardDb()
  const store = boardStore()
  if (!db || !store) return { ok: false, error: 'Not set up yet' }

  const detail: Record<string, unknown> = { id }
  // Inside the logged write, and answering rather than throwing: a board or bucket that
  // refuses is an error entry and a message on the panel, never a rejection the button
  // would be left waiting on.
  const rebuild = async (): Promise<Outcome> => {
    try {
      const post = await getCollectionPost(db, id)
      if (!post) return { ok: false, error: `Image ${id} not found.` }
      detail.fileName = post.file_name
      detail.fileExt = post.file_ext

      const image = await storedImage(
        post.file_name,
        post.file_ext,
        collectionImagePath(post.file_name, post.file_ext)
      )
      if (!image) return { ok: false, error: 'Could not download the stored image.' }

      const thumb = await compressImgForThumbnail(image.bytes)
      if (!thumb.ok || !thumb.buffer) return { ok: false, error: thumb.message }

      await store.put(collectionThumbnailPath(post.file_name), thumb.buffer, 'image/avif')
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Rebuild failed.' }
    }
  }
  const rebuilt = await logged('collection:rebuild-thumbnail', detail, rebuild())
  if (!rebuilt.ok || !loadConfig()?.purge || typeof detail.fileName !== 'string') return rebuilt

  // Its own entry, after the rebuild has already answered: the new file is in the bucket
  // either way, so a refused purge is a notice (an error entry raises one), not a failure.
  const url = boardImageUrl(collectionThumbnailPath(detail.fileName))
  await logged('collection:purge-thumbnail', { id, url }, purgeCdnUrls([url]))
  return rebuilt
}
