import { readFile } from 'node:fs/promises'
import {
  COLLECTION_PAGE_SIZE,
  createCollection,
  deleteCollection,
  deleteCollectionPostRow,
  getCollectionPost,
  listCollectionPosts,
  listCollections,
  moveCollectionPost,
  renameCollection,
  updateCollectionPost,
  type Collection,
  type CollectionPostPage,
} from '@common/data/collections'
import { collectionImagePath, collectionThumbnailPath } from '@common/storage'
import { createCollectionPostFromImage, type UploadResult } from '@common/upload/pipeline'
import { RATINGS, type Rating } from '@common/search'
import { DESKTOP_UPLOAD_LIMITS } from './limits'
import { boardDb } from './db'
import { boardStore } from './r2'
import { cachedThumbnail, forgetThumbnail } from './manage'

/**
 * Collections, from the side that writes them.
 *
 * This is the whole of what the app can do to a shelf, and it is short because a shelf is
 * short: name one, rename one, delete an empty one, add an image, correct one, move one to
 * another shelf, remove one. There is no tag vocabulary to keep in step, so nothing here touches the tag cache —
 * which is most of what `main/manage.ts` does around each of its writes.
 *
 * **No cache of its own either.** The tag index is cached because autocomplete asked the
 * same question on every keystroke; the browse grid is cached because it is a screenful of
 * search results somebody wants back when the window reopens. A shelf list is a handful of
 * rows read when you open the screen and again when you press 🔄, and a cache would be a
 * second thing that can be wrong about a name you have just changed.
 *
 * The thumbnails **are** cached, and in the same place the boards' are (`cachedThumbnail`):
 * the name is the md5 of the uploaded bytes, so the same image is the same thumbnail
 * wherever it was posted. Only the fetch path differs, and that is an argument now.
 */

export type Outcome = { ok: true } | { ok: false; error: string }

export async function readCollections(): Promise<Collection[]> {
  const db = boardDb()
  if (!db) return []
  // Every shelf, including the ones with nothing on them — unlike the website, which hides
  // those. A shelf you have just named is exactly the row you are looking for here.
  return listCollections(db)
}

export async function readCollectionPosts(options: {
  collectionId: number
  after?: number
  perPage?: number
}): Promise<CollectionPostPage> {
  const db = boardDb()
  if (!db) return { posts: [], hasMore: false }

  return listCollectionPosts(db, options.collectionId, {
    after: options.after,
    perPage: options.perPage ?? COLLECTION_PAGE_SIZE,
  })
}

export async function makeCollection(
  name: string
): Promise<{ ok: true; id: number; name: string } | { ok: false; error: string }> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'Not set up yet' }
  return createCollection(db, name)
}

export async function renameCollectionRow(
  id: number,
  name: string
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'Not set up yet' }
  return renameCollection(db, id, name)
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
  return deleteCollection(db, id)
}

/**
 * One file onto one shelf.
 *
 * The same shape `post:upload` has, minus the tags — the bytes are read here rather than
 * sent across the bridge, for the same reason: a 50MB image would be copied twice to make
 * the trip and the renderer has no reason to hold it at all.
 */
export async function uploadToCollection(request: {
  collectionId: number
  path: string
  rating: string
  sourceUrl: string
}): Promise<UploadResult> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'Not set up yet' }

  const store = boardStore()
  if (!store) return { ok: false, error: 'Not set up yet' }

  // The stored code straight from the screen's <select>, not the query spelling — the same
  // distinction `savePost` makes, and refused rather than defaulted for the same reason.
  if (!(RATINGS as readonly string[]).includes(request.rating)) {
    return { ok: false, error: `${request.rating} is not a rating on this board.` }
  }

  let bytes: Buffer
  try {
    bytes = await readFile(request.path)
  } catch {
    return { ok: false, error: 'Could not read the file — has it moved?' }
  }

  return createCollectionPostFromImage(
    db,
    store,
    bytes,
    {
      collectionId: request.collectionId,
      rating: request.rating as Rating,
      sourceUrl: request.sourceUrl,
    },
    DESKTOP_UPLOAD_LIMITS
  )
}

/** A collection image's rating and source — the whole of what there is to edit. */
export async function saveCollectionPost(
  id: number,
  rawRating: string,
  sourceUrl: string
): Promise<Outcome> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'Not set up yet' }

  if (!(RATINGS as readonly string[]).includes(rawRating)) {
    return { ok: false, error: `${rawRating} is not a rating on this board.` }
  }

  return updateCollectionPost(db, id, { rating: rawRating as Rating, source_url: sourceUrl })
}

/**
 * Moves an image to another shelf.
 *
 * No bytes move: a collection's images sit under one flat prefix, so which shelf an image
 * is on is one column of one row — see `moveCollectionPost`, which is the whole of it.
 */
export async function moveCollectionImage(id: number, collectionId: number): Promise<Outcome> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'Not set up yet' }
  return moveCollectionPost(db, id, collectionId)
}

/**
 * Removes an image from a shelf and deletes both stored objects.
 *
 * Row first, files second, and the row is read before either — the same order `removePost`
 * uses and for the same reasons: a failed delete leaves the image whole, and the paths
 * derive from `file_name`, which nothing else stores.
 */
export async function removeCollectionPost(id: number): Promise<Outcome> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'Not set up yet' }

  const post = await getCollectionPost(db, id)
  if (!post) return { ok: false, error: `Image ${id} not found.` }

  try {
    const gone = await deleteCollectionPostRow(db, id)
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

  forgetThumbnail(post.file_name)
  return { ok: true }
}

/** A collection image's thumbnail as a `data:` URL — the grid's, across the bridge for the
 *  reason the board's is: the window's CSP is `img-src 'self' data:` and stays that way. */
export async function collectionThumbnailDataUrl(fileName: string): Promise<string> {
  return cachedThumbnail(fileName, collectionThumbnailPath(fileName))
}
