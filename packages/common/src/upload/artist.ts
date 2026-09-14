import { findArtistImagesByFileNames } from '@common/data/artists'
import { createArtistImage } from '@common/data/artists-write'
import { artistImagePath, artistThumbnailPath, type ObjectStore } from '@common/storage'
import type { Db } from '@common/db'
import type { UploadLimits } from './pipeline'
import { encodeImage, inspectImage, storeImage } from './image'

export type ArtistImageResult = { ok: true; imageId: number } | { ok: false; error: string }

/**
 * One example image onto one artist.
 *
 * The same three expensive steps every upload shares — inspect, encode, store — because the
 * compression is an argument about bytes and has nothing to do with whose row lands. Its own
 * file rather than a third entry point in `pipeline.ts`: an artist is kept apart from every
 * other feature, and what surrounds the encode here (no rating, no source, no tags, a dedup
 * across every artist) shares nothing with a post's.
 */
export async function createArtistImageFromImage(
  db: Db,
  store: ObjectStore,
  bytes: Buffer,
  artistId: number,
  limits: UploadLimits
): Promise<ArtistImageResult> {
  const inspected = await inspectImage(bytes, limits)
  if (!inspected.ok) return inspected
  const { md5 } = inspected.image

  const existing = (await findArtistImagesByFileNames(db, [md5])).get(md5)
  if (existing) return { ok: false, error: `Already an example for ${existing.artist_name}` }

  const result = await encodeImage(bytes, inspected.image)
  if (!result.ok) return result
  const { encoded } = result

  const imagePath = artistImagePath(md5, encoded.postExt)
  const thumbPath = artistThumbnailPath(md5)
  const stored = await storeImage(store, encoded, imagePath, thumbPath)
  if (!stored.ok) return stored

  try {
    const imageId = await createArtistImage(db, {
      artist_id: artistId,
      file_name: md5,
      file_ext: encoded.postExt,
      file_size: encoded.postBuffer.length,
      width: encoded.postWidth,
      height: encoded.postHeight,
    })
    return { ok: true, imageId }
  } catch (error) {
    // An artist deleted while this was encoding lands here, as a foreign key failure — the
    // objects go either way, so a retry starts clean.
    await store.remove(imagePath)
    await store.remove(thumbPath)
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `Database insert failed: ${message}` }
  }
}
