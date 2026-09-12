import { z } from 'zod'
import { createPostWithTags, findPostIdByFileName, resolveTagIds } from '@common/data/shared'
import { findCollectionPostByFileName } from '@common/data/collections'
import { createCollectionPost } from '@common/data/collections-write'
import {
  collectionImagePath,
  collectionThumbnailPath,
  postImagePath,
  thumbnailPath,
  type ObjectStore,
} from '@common/storage'
import type { Board } from '@common/board'
import { RATINGS, type Rating } from '@common/search'
import { parseTagInput } from '@common/tags'
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

export type PostMetadata = {
  tags: string[]
  rating: Rating
  sourceUrl: string
}

// Same shape the edit form posts, minus the id — a staged file carries the metadata
// it will be created with, so an upload never has to be fixed up afterwards.
const metadataSchema = z.object({
  tags: z.string(),
  rating: z.enum(RATINGS),
  source_url: z
    .string()
    .trim()
    .pipe(z.union([z.literal(''), z.url('Source must be a valid URL')])),
})

/**
 * Validates the three fields staged beside an image and normalizes the tag string into
 * a list. Shared so the web form and the desktop queue reject the same input with the
 * same words — the tag charset in particular is only spelled once.
 */
export function parsePostMetadata(
  raw: unknown
): { ok: true; metadata: PostMetadata } | { ok: false; error: string } {
  const parsed = metadataSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const { tags, invalid } = parseTagInput(parsed.data.tags)
  if (invalid.length > 0) {
    return {
      ok: false,
      error: `Invalid tags (lowercase a-z 0-9 _ ( ) . - only): ${invalid.join(', ')}`,
    }
  }

  return {
    ok: true,
    metadata: { tags, rating: parsed.data.rating, sourceUrl: parsed.data.source_url },
  }
}

/**
 * Creates one post from one image's bytes.
 *
 * Two handles, and it builds neither: the database, and somewhere to put the files. They
 * were one Supabase client that was both — a bucket and a schema behind one key — and
 * splitting them is what a separate database and a separate bucket made honest. Only the
 * desktop app holds either, since it is the only thing that writes.
 *
 * `board` picks the table the row lands in and the prefix the two objects land under
 * (`@common/board`). Nothing else about the pipeline moves: the compression, the dedup
 * hash, the limits and the tag resolution are the same questions on either board. It
 * defaults to the gallery, so a caller that has never heard of the second board is
 * unchanged.
 */
export async function createPostFromImage(
  db: DbPool,
  store: ObjectStore,
  bytes: Buffer,
  metadata: PostMetadata,
  limits: UploadLimits,
  board: Board = 'post'
): Promise<UploadResult> {
  const inspected = await inspectImage(bytes, limits)
  if (!inspected.ok) return inspected
  const { md5 } = inspected.image

  // Per board: the same image can be a post on both, which is correct — they are two
  // boards, and the two rows point at two stored objects under two prefixes.
  const existingPostId = await findPostIdByFileName(db, md5, board)
  if (existingPostId !== null) {
    return { ok: false, error: 'This image already exists', existingPostId }
  }

  // A tag the board doesn't have fails the insert at the bottom of this function, which
  // by then has cost a full encode and two storage uploads to undo. The same question
  // asked here, next to the other one this function asks the board, costs one small
  // select on the way past and turns a mistyped or stale tag into an error before any
  // pixels are decoded. The insert still checks — this is an early out, not the rule.
  try {
    await resolveTagIds(db, metadata.tags)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown tags' }
  }

  const result = await encodeImage(bytes, inspected.image)
  if (!result.ok) return result
  const { encoded } = result

  const imagePath = postImagePath(md5, encoded.postExt, board)
  const thumbPath = thumbnailPath(md5, board)
  const stored = await storeImage(store, encoded, imagePath, thumbPath)
  if (!stored.ok) return stored

  let postId: number
  try {
    postId = await createPostWithTags(
      db,
      {
        file_name: md5,
        file_ext: encoded.postExt,
        file_size: encoded.postBuffer.length,
        width: encoded.postWidth,
        height: encoded.postHeight,
        rating: metadata.rating,
        source_url: metadata.sourceUrl,
        tags: metadata.tags,
      },
      board
    )
  } catch (error) {
    // The write itself is a transaction now, so there is no half-made post to undo —
    // only the two objects, which nothing would ever ask for again. Removing them is
    // what keeps a retry of the same image starting clean rather than uploading over
    // itself.
    await store.remove(imagePath)
    await store.remove(thumbPath)
    return { ok: false, error: `Database insert failed: ${message(error)}` }
  }

  return { ok: true, postId }
}

/** The three fields a collection post is made with. No tags, which is the whole
 *  difference between this and `PostMetadata` and the whole point of the feature. */
export type CollectionPostMetadata = {
  collectionId: number
  rating: Rating
  sourceUrl: string
}

/**
 * The same pipeline, into a collection.
 *
 * It shares every expensive part with the function above — `inspectImage`, `encodeImage`,
 * `storeImage` — because the compression is an argument about bytes and has nothing to do
 * with where the row lands. What is genuinely different is only what is around it: no tags
 * to resolve, a different prefix pair, and a dedup check against the whole of
 * `collection_posts` rather than against one board, since an image lives on exactly one
 * shelf and the refusal can say which.
 *
 * A separate entry point rather than a `board: 'collection'` argument, for the reason
 * `@common/collections` gives: a collection is not a board, and a parameter that made it
 * one would have carried a tag list nothing reads through the middle of this file.
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
    postId = await createCollectionPost(db, {
      collection_id: metadata.collectionId,
      file_name: md5,
      file_ext: encoded.postExt,
      file_size: encoded.postBuffer.length,
      width: encoded.postWidth,
      height: encoded.postHeight,
      rating: metadata.rating,
      source_url: metadata.sourceUrl,
    })
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
