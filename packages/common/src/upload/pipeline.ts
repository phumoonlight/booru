import { createHash } from 'node:crypto'
import sharp, { type Metadata } from 'sharp'
import { z } from 'zod'
import { POST_MAX_DIMENSION, compressImgForPost } from '@common/imgcmp/for-post'
import { compressImgForThumbnail } from '@common/imgcmp/for-thumbnail'
import { createPostWithTags, findPostIdByFileName, resolveTagIds } from '@common/data/shared'
import {
  createCollectionPost,
  findCollectionPostByFileName,
} from '@common/data/collections'
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

const FORMAT_TO_EXT: Record<string, string> = {
  jpeg: 'jpg',
  png: 'png',
  gif: 'gif',
  webp: 'webp',
  avif: 'avif',
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
}

// Debug logging for the re-encode branches below. The whole point of those branches is
// that the winner depends on the input, so the only way to tune them is to watch real
// uploads lose — one line per attempt, keyed by the md5 so concurrent uploads stay
// legible.
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)}kB`
const pct = (candidate: number, baseline: number) =>
  `${candidate < baseline ? '-' : '+'}${((Math.abs(candidate - baseline) / baseline) * 100).toFixed(1)}%`

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
 * What the bytes are, before anything has been decoded — the cheap half of the pipeline,
 * and the half both callers run before they ask the board anything.
 *
 * Header reads only. This is the last point at which an oversized or unreadable file can
 * be turned away for free, and it is also where the md5 comes from, which is what makes
 * the dedup question answerable before a single pixel is encoded.
 */
type InspectedImage = {
  meta: Metadata
  width: number
  height: number
  ext: string
  animated: boolean
  /** The md5 of the *uploaded* bytes — `file_name` on whichever table, and the name both
   *  stored objects take. Hashing what came in rather than what gets stored is what keeps
   *  dedup stable however the re-encode below turns out. */
  md5: string
}

async function inspectImage(
  bytes: Buffer,
  limits: UploadLimits
): Promise<{ ok: true; image: InspectedImage } | { ok: false; error: string }> {
  if (bytes.length === 0) return { ok: false, error: 'Pick an image file' }
  if (bytes.length > limits.maxFileSize) {
    return { ok: false, error: `File is too large (max ${limits.maxFileSizeLabel})` }
  }

  let meta: Metadata
  try {
    meta = await sharp(bytes).metadata()
  } catch {
    return { ok: false, error: 'File is not a readable image' }
  }

  // EXIF orientations 5-8 turn the image a quarter turn, and metadata() reports
  // the size *before* that turn. Both ends of the pipeline show it turned —
  // browsers apply the tag to a stored original, and sharp bakes the rotation
  // into anything it re-encodes — so the recorded size has to be swapped to match.
  const quarterTurned = (meta.orientation ?? 1) >= 5
  const width = quarterTurned ? meta.height : meta.width
  const height = quarterTurned ? meta.width : meta.height
  const ext = meta.format ? FORMAT_TO_EXT[meta.format] : undefined
  if (!ext || !width || !height) {
    return { ok: false, error: 'Unsupported format (jpg/png/gif/webp/avif only)' }
  }
  // Nothing has been decoded yet — metadata() only reads headers — so this is the
  // last point where an oversized image can be turned away for free.
  if (width * height > limits.maxPixels) {
    return {
      ok: false,
      error: `Image has too many pixels (max ${limits.maxPixels / 1_000_000}MP)`,
    }
  }

  return {
    ok: true,
    image: {
      meta,
      width,
      height,
      ext,
      animated: (meta.pages ?? 1) > 1,
      md5: createHash('md5').update(bytes).digest('hex'),
    },
  }
}

/** What actually gets stored, once the encoders have argued it out. */
type EncodedImage = {
  postBuffer: Buffer
  postExt: string
  postWidth: number
  postHeight: number
  thumb: Buffer
}

/**
 * The expensive half: the thumbnail, the AVIF candidate for the post image, and the PNG
 * re-deflate that only runs when AVIF lost.
 *
 * Neither caller has an opinion about any of it — a collection's image is compressed
 * exactly as a post's is, because the argument for each of these branches is about the
 * bytes rather than about what table the row lands in.
 */
async function encodeImage(
  bytes: Buffer,
  image: InspectedImage
): Promise<{ ok: true; encoded: EncodedImage } | { ok: false; error: string }> {
  const { meta, md5, ext, width, height, animated } = image

  // Unlike the post image below there is no fallback here — a post with no
  // thumbnail has nothing to show in the grid — so a failure ends the upload with
  // the same error shape as everything else rather than throwing out of the caller.
  const thumbResult = await compressImgForThumbnail(bytes)
  if (!thumbResult.buffer) {
    return { ok: false, error: thumbResult.message }
  }

  // Post image: the AVIF candidate is kept only when it actually comes out smaller than
  // the uploaded bytes. It is lossy (quality 50), so it usually does — the comparison
  // earns its keep on inputs that were already small or already AVIF. A failed encode is
  // not fatal: the upload itself is always storable.
  //
  // Oversized is the exception: past POST_MAX_DIMENSION the candidate is not competing
  // on bytes at all, it is the only version inside the cap, so it is kept however it
  // measures. The one input that can still land over the cap is an animation, which
  // the encoder declines rather than flatten to frame 1.
  let postBuffer: Buffer = bytes
  let postExt = ext
  let postWidth = width
  let postHeight = height
  const oversized = width > POST_MAX_DIMENSION || height > POST_MAX_DIMENSION
  const startedAt = Date.now()
  const postResult = await compressImgForPost(meta, bytes)
  if (postResult.buffer) {
    const avif = postResult.buffer
    const won = oversized || avif.length < postBuffer.length
    const outWidth = postResult.width ?? width
    const outHeight = postResult.height ?? height
    console.log(
      `[upload ${md5.slice(0, 8)}] post avif: ${ext} ${kb(bytes.length)} ${width}x${height}` +
        ` -> avif ${kb(avif.length)} ${outWidth}x${outHeight} ` +
        `(${pct(avif.length, bytes.length)}, ${Date.now() - startedAt}ms) — ` +
        `${won ? (oversized ? 'kept, over cap' : 'kept') : 'discarded'}`
    )
    if (won) {
      postBuffer = avif
      postExt = 'avif'
      postWidth = outWidth
      postHeight = outHeight
    }
  } else if (!postResult.ok) {
    console.log(
      `[upload ${md5.slice(0, 8)}] post avif: encoder failed — ` +
        `${postResult.error?.message ?? postResult.message}`
    )
  }

  // AVIF lost and the upload is a PNG: re-deflate it instead. Same pixels, just a
  // better-packed PNG. Adaptive filtering wins big on photographic content and
  // loses on flat colour, so both are tried and the smaller one kept.
  // `palette` must stay false — `effort` alone silently turns on quantisation.
  //
  // `.rotate()` applies the EXIF orientation rather than turning by any angle.
  // libvips does that on its own when it resizes or changes format, but PNG to
  // PNG does neither: the pixels would pass through untouched while the tag is
  // dropped on output, losing the rotation for good. Every other branch here
  // ends up turned, so this one has to be told to.
  if (!animated && ext === 'png' && postExt !== 'avif') {
    try {
      const [plain, adaptive] = await Promise.all([
        sharp(bytes)
          .rotate()
          .png({ compressionLevel: 9, palette: false })
          .keepIccProfile()
          .toBuffer(),
        sharp(bytes)
          .rotate()
          .png({ compressionLevel: 9, palette: false, adaptiveFiltering: true })
          .keepIccProfile()
          .toBuffer(),
      ])
      const best = adaptive.length < plain.length ? adaptive : plain
      const won = best.length < postBuffer.length
      console.log(
        `[upload ${md5.slice(0, 8)}] png re-deflate: original ${kb(bytes.length)} -> ` +
          `plain ${kb(plain.length)} / adaptive ${kb(adaptive.length)}, best ` +
          `${kb(best.length)} (${pct(best.length, bytes.length)}) — ` +
          `${won ? 'kept' : 'discarded'}`
      )
      if (won) {
        postBuffer = best
      }
    } catch (error) {
      // Same fallback as above — the upload is always a valid answer
      console.log(
        `[upload ${md5.slice(0, 8)}] png re-deflate: failed — ` +
          `${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  console.log(
    `[upload ${md5.slice(0, 8)}] stored: uploaded ${ext} ${kb(bytes.length)} -> ` +
      `${postExt} ${kb(postBuffer.length)} (${pct(postBuffer.length, bytes.length)}), ` +
      `thumb ${kb(thumbResult.buffer.length)}`
  )

  return {
    ok: true,
    encoded: { postBuffer, postExt, postWidth, postHeight, thumb: thumbResult.buffer },
  }
}

/**
 * Both objects into the bucket, and back out again if the second one fails.
 *
 * The files go in before the row, because the row is what makes them findable: an object
 * nothing points at is invisible litter, where a row pointing at a missing object is a
 * broken image on the board.
 */
async function storeImage(
  store: ObjectStore,
  encoded: EncodedImage,
  imagePath: string,
  thumbPath: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await store.put(imagePath, encoded.postBuffer, CONTENT_TYPES[encoded.postExt])
  } catch (error) {
    return { ok: false, error: `Storage upload failed: ${message(error)}` }
  }

  try {
    await store.put(thumbPath, encoded.thumb, 'image/avif')
  } catch (error) {
    await store.remove(imagePath)
    return { ok: false, error: `Thumbnail upload failed: ${message(error)}` }
  }

  return { ok: true }
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
