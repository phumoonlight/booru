import { findCollectionPostByFileName } from '@common/data/collections'
import { createCollectionPost } from '@common/data/collections-write'
import { collectionImagePath, collectionThumbnailPath, type ObjectStore } from '@common/storage'
import type { DbPool } from '@common/db'
import { encodeImage, inspectImage, storeImage } from './image'

/**
 * One image in, one post out: validate, compress, store, insert, and put back whatever
 * landed if any of that fails.
 *
 * This is the half of the upload that has nothing to do with how the bytes arrived or
 * where they are going. The desktop app hands it a file read off disk, a database handle
 * and a bucket; it builds none of the three, which is what lets it compile in Electron's
 * main process (invariant 3).
 *
 * What stays with the caller: whatever gets the bytes off disk, and the limits — those
 * are a property of where the code runs, not of the pipeline (see `limits` below).
 */

export type UploadResult =
  | { ok: true; postId: number }
  | { ok: false; error: string; existingPostId?: number }

/**
 * Where the ceilings come from is the caller's business — the desktop app's are its own
 * (`packages/desktop/src/main/limits.ts`) and now the only ones, the website having
 * stopped taking uploads. Nothing in here has an opinion about them.
 */
export type UploadLimits = {
  maxFileSize: number
  maxFileSizeLabel: string
  maxPixels: number
}

/** What a collection post is made with. No rating — the shelf's rating is the image's. The
 *  tags are the shelf's own, by id, since nothing coins one. */
export type CollectionPostMetadata = {
  collectionId: number
  sourceUrl: string
  tagIds?: readonly number[]
}

/**
 * One image onto one shelf.
 *
 * The dedup check is against the whole of `collection_posts`, since an image lives on
 * exactly one shelf and the refusal can say which. The expensive parts — `inspectImage`,
 * `encodeImage`, `storeImage` — are `./image`'s, shared with an artist's examples.
 */
export async function createCollectionPostFromImage(
  db: DbPool,
  store: ObjectStore,
  bytes: Buffer,
  metadata: CollectionPostMetadata,
  limits: UploadLimits
): Promise<UploadResult> {
  const inspected = await inspectImage(bytes, limits)
  if (!inspected.ok) return inspected
  const { md5 } = inspected.image

  const existing = await findCollectionPostByFileName(db, md5)
  if (existing !== null) {
    return {
      ok: false,
      error: `This image is already in ${existing.collection_name}`,
      existingPostId: existing.id,
    }
  }

  const result = await encodeImage(bytes, inspected.image)
  if (!result.ok) return result
  const { encoded } = result

  const imagePath = collectionImagePath(md5, encoded.postExt)
  const thumbPath = collectionThumbnailPath(md5)
  const stored = await storeImage(store, encoded, imagePath, thumbPath)
  if (!stored.ok) return stored

  let postId: number
  try {
    postId = await createCollectionPost(
      db,
      {
        collection_id: metadata.collectionId,
        file_name: md5,
        file_ext: encoded.postExt,
        file_size: encoded.postBuffer.length,
        width: encoded.postWidth,
        height: encoded.postHeight,
        source_url: metadata.sourceUrl,
      },
      metadata.tagIds
    )
  } catch (error) {
    await store.remove(imagePath)
    await store.remove(thumbPath)
    return { ok: false, error: `Database insert failed: ${message(error)}` }
  }

  return { ok: true, postId }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
