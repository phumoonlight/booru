import { readFile } from 'node:fs/promises'
import {
  COLLECTION_PAGE_SIZE,
  getCollectionPost,
  listCollectionPosts,
  listCollections,
  type Collection,
  type CollectionPostPage,
} from '@common/data/collections'
import {
  createCollection,
  deleteCollection,
  deleteCollectionPostRow,
  moveCollectionPosts,
  updateCollection,
  updateCollectionPost,
  type CollectionInput,
} from '@common/data/collections-write'
import { collectionImagePath, collectionThumbnailPath } from '@common/storage'
import { createCollectionPostFromImage, type UploadResult } from '@common/upload/pipeline'
import { RATINGS, type Rating } from '@common/search'
import { DESKTOP_UPLOAD_LIMITS } from './limits'
import { boardDb } from './db'
import { boardStore } from './r2'
import { cachedImage, cachedThumbnail, forgetImage } from './image-cache'
import { cachedCollectionPosts, cachedCollections, dropCollectionCache } from './collection-cache'

/**
 * Collections, from the side that writes them.
 *
 * This is the whole of what the app can do to a shelf, and it is short because a shelf is
 * short: name one, edit one, delete an empty one, add an image, correct one, move one to
 * another shelf, remove one. There is no tag vocabulary to keep in step, so nothing here
 * touches the tag cache.
 *
 * **Every write here drops the cache** (`main/collection-cache.ts`), which is the whole of
 * what this file has to remember about it. A shelf's `updated_at` moves when an image is
 * added, removed or moved, so no write's effect is confined to one cached answer and there
 * is nothing finer-grained worth attempting.
 *
 * The images themselves are cached in the one place every stored image is
 * (`main/image-cache.ts`): the name is the md5 of the uploaded bytes, so the same image is
 * the same file wherever it is stored. Only the path under the bucket differs, and that is
 * an argument.
 */

export type Outcome = { ok: true } | { ok: false; error: string }

/**
 * Every statement that reaches the board goes out through here, so that forgetting the
 * cache is not a line somebody can forget to add. It drops on the board's refusals too — a
 * write that failed may still have moved a row on the way, and a cache thrown away costs
 * one read. The rating check in front of two of these is not one of them: it never gets as
 * far as a statement.
 */
async function dropping<T>(result: T | Promise<T>): Promise<T> {
  try {
    return await result
  } finally {
    dropCollectionCache()
  }
}

export async function readCollections(force = false): Promise<Collection[]> {
  const db = boardDb()
  if (!db) return []
  // Every shelf, including the ones with nothing on them — unlike the website, which hides
  // those. A shelf you have just named is exactly the row you are looking for here.
  return cachedCollections(() => listCollections(db), force)
}

export async function readCollectionPosts(options: {
  collectionId: number
  after?: number
  perPage?: number
}): Promise<CollectionPostPage> {
  const db = boardDb()
  if (!db) return { posts: [], hasMore: false }

  const perPage = options.perPage ?? COLLECTION_PAGE_SIZE
  return cachedCollectionPosts({ ...options, perPage }, () =>
    listCollectionPosts(db, options.collectionId, { after: options.after, perPage })
  )
}

type Shelf = { name: string; mark: string | null; rating: Rating; is_ai: boolean }

/** The rating off the form's `<select>`, refused rather than defaulted: silently writing
 *  General over an R-18 shelf is a wrong answer that only shows up on the public site. */
function ratingError(input: CollectionInput): { ok: false; error: string } | null {
  return (RATINGS as readonly string[]).includes(input.rating)
    ? null
    : { ok: false, error: `${input.rating} is not a rating on this board.` }
}

export async function makeCollection(
  input: CollectionInput
): Promise<({ ok: true; id: number } & Shelf) | { ok: false; error: string }> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'Not set up yet' }
  return ratingError(input) ?? dropping(createCollection(db, input))
}

export async function editCollection(
  id: number,
  input: CollectionInput
): Promise<({ ok: true } & Shelf) | { ok: false; error: string }> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'Not set up yet' }
  return ratingError(input) ?? dropping(updateCollection(db, id, input))
}

/**
 * Deletes a shelf, which only works when it is empty — `deleteCollection` counts first and
 * says how many are in the way, and the foreign key would refuse it regardless. That rule
 * is the reason this feature has a container at all: a collection is the only thing in this
 * project whose deletion could take a set of images with it, so it cannot.
 */
export async function removeCollection(id: number): Promise<Outcome> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'Not set up yet' }
  return dropping(deleteCollection(db, id))
}

/**
 * One file onto one shelf. No rating: an image's tier is its shelf's.
 *
 * The bytes are read here rather than sent across the bridge: a 50MB image would be copied
 * twice to make the trip and the renderer has no reason to hold it at all.
 */
export async function uploadToCollection(request: {
  collectionId: number
  path: string
  sourceUrl: string
}): Promise<UploadResult> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'Not set up yet' }

  const store = boardStore()
  if (!store) return { ok: false, error: 'Not set up yet' }

  let bytes: Buffer
  try {
    bytes = await readFile(request.path)
  } catch {
    return { ok: false, error: 'Could not read the file — has it moved?' }
  }

  return dropping(
    createCollectionPostFromImage(
      db,
      store,
      bytes,
      { collectionId: request.collectionId, sourceUrl: request.sourceUrl },
      DESKTOP_UPLOAD_LIMITS
    )
  )
}

/** A collection image's source — the whole of what there is to edit on one image. */
export async function saveCollectionPost(id: number, sourceUrl: string): Promise<Outcome> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'Not set up yet' }
  return dropping(updateCollectionPost(db, id, { source_url: sourceUrl }))
}

/**
 * Moves the manage selection onto another shelf. No bytes move: a collection's images sit
 * under one flat prefix, so which shelf an image is on is one column — see
 * `moveCollectionPosts`, which is the whole of it.
 */
export async function moveCollectionImages(
  ids: number[],
  collectionId: number
): Promise<{ ok: true; moved: number } | { ok: false; error: string }> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'Not set up yet' }
  return dropping(moveCollectionPosts(db, ids, collectionId))
}

/**
 * Removes an image from a shelf and deletes both stored objects.
 *
 * Row first, files second, and the row is read before either: a failed delete leaves the
 * image whole, and the paths derive from `file_name`, which nothing else stores.
 */
export async function removeCollectionPost(id: number): Promise<Outcome> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'Not set up yet' }

  const post = await getCollectionPost(db, id)
  if (!post) return { ok: false, error: `Image ${id} not found.` }

  try {
    const gone = await dropping(deleteCollectionPostRow(db, id))
    if (!gone) return { ok: false, error: `Image ${id} not found.` }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Delete failed.' }
  }

  // The row is gone, so a storage failure is logged rather than reported: it leaves two
  // orphaned objects, which is untidy, and calling it a failed delete would be wrong about
  // the thing that was actually asked for.
  const store = boardStore()
  if (store) {
    await Promise.all([
      store
        .remove(collectionImagePath(post.file_name, post.file_ext))
        .catch((error: unknown) => console.error('Could not remove the image:', error)),
      store
        .remove(collectionThumbnailPath(post.file_name))
        .catch((error: unknown) => console.error('Could not remove the thumbnail:', error)),
    ])
  }

  forgetImage(post.file_name, post.file_ext)
  return { ok: true }
}

/** A collection image's thumbnail as a `data:` URL — across the bridge because the window's
 *  CSP is `img-src 'self' data:` and stays that way. */
export async function collectionThumbnailDataUrl(fileName: string): Promise<string> {
  return cachedThumbnail(fileName, collectionThumbnailPath(fileName))
}

/** The stored image at full size, for the viewer 🔍 Full size opens. The row is read for
 *  its `file_ext`: the stored object is the AVIF only when it beat the uploaded bytes. */
export async function collectionImageDataUrl(id: number): Promise<string> {
  const db = boardDb()
  if (!db) return ''
  const post = await getCollectionPost(db, id)
  if (!post) return ''

  return cachedImage(
    post.file_name,
    post.file_ext,
    collectionImagePath(post.file_name, post.file_ext)
  )
}
