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
import {
  listCollectionTags,
  listPostTags,
  type CollectionTag,
} from '@common/data/collection-tags'
import {
  createCollectionTag,
  deleteCollectionTag,
  setCollectionPostsTag,
  updateCollectionTag,
  type CollectionTagInput,
} from '@common/data/collection-tags-write'
import { collectionImagePath, collectionThumbnailPath } from '@common/storage'
import { createCollectionPostFromImage, type UploadResult } from '@common/upload/pipeline'
import { RATINGS, type Rating } from '@common/search'
import { DESKTOP_UPLOAD_LIMITS } from './limits'
import { boardDb } from './db'
import { boardStore } from './r2'
import { cachedImage, cachedThumbnail, forgetImage } from './image-cache'
import { cachedCollectionPosts, cachedCollections, dropCollectionCache } from './collection-cache'
import { logged } from './activity-log'
import { removeStoredObjects } from './stored-objects'

/**
 * Collections, from the side that writes them.
 *
 * This is the whole of what the app can do to a shelf, and it is short because a shelf is
 * short: name one, edit one, delete an empty one, add an image, correct one, move one to
 * another shelf, remove one — and a shelf's own tags, made here and put on its images. Those
 * are not the board's vocabulary, so nothing here touches the tag cache.
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
  tags?: string[]
}): Promise<CollectionPostPage> {
  const db = boardDb()
  if (!db) return { posts: [], hasMore: false }

  const perPage = options.perPage ?? COLLECTION_PAGE_SIZE
  return cachedCollectionPosts({ ...options, perPage }, () =>
    listCollectionPosts(db, options.collectionId, {
      after: options.after,
      perPage,
      tags: options.tags,
    })
  )
}

/**
 * A shelf's tags with their counts. Not cached: it is read when a shelf opens and again
 * after a write that changes a count, and a copy would be one more thing every tag write had
 * to throw away.
 */
export async function readCollectionTags(collectionId: number): Promise<CollectionTag[]> {
  const db = boardDb()
  return db ? listCollectionTags(db, collectionId) : []
}

/** The tags on one image — what its panel lights. */
export async function readPostTags(
  postId: number
): Promise<Omit<CollectionTag, 'post_count'>[]> {
  const db = boardDb()
  return db ? listPostTags(db, postId) : []
}

/**
 * The writes to a shelf's tags. Each drops the collection cache like every other write
 * here: its pages are keyed by the pills that were lit, and a tag put on or taken off an
 * image changes which filtered page that image belongs to.
 */
export async function makeCollectionTag(
  collectionId: number,
  input: CollectionTagInput
): Promise<
  { ok: true; id: number; name: string; mark: string | null } | { ok: false; error: string }
> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'Not set up yet' }
  return logged(
    'collection-tag:create',
    { collectionId, name: input.name },
    dropping(createCollectionTag(db, collectionId, input)),
    (result) => ({ id: result.id })
  )
}

export async function editCollectionTag(
  id: number,
  input: CollectionTagInput
): Promise<{ ok: true; name: string; mark: string | null } | { ok: false; error: string }> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'Not set up yet' }
  return logged(
    'collection-tag:edit',
    { id, ...input },
    dropping(updateCollectionTag(db, id, input))
  )
}

export async function removeCollectionTag(id: number): Promise<Outcome> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'Not set up yet' }
  return logged('collection-tag:delete', { id }, dropping(deleteCollectionTag(db, id)))
}

export async function tagCollectionPosts(request: {
  tagId: number
  postIds: number[]
  on: boolean
}): Promise<{ ok: true; changed: number } | { ok: false; error: string }> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'Not set up yet' }
  return logged(
    request.on ? 'collection-tag:apply' : 'collection-tag:remove',
    { tagId: request.tagId, postIds: request.postIds },
    dropping(setCollectionPostsTag(db, request)),
    (result) => ({ changed: result.changed })
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
  return (
    ratingError(input) ??
    logged('collection:create', { ...input }, dropping(createCollection(db, input)), (result) => ({
      id: result.id,
    }))
  )
}

export async function editCollection(
  id: number,
  input: CollectionInput
): Promise<({ ok: true } & Shelf) | { ok: false; error: string }> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'Not set up yet' }
  return (
    ratingError(input) ??
    logged('collection:edit', { id, ...input }, dropping(updateCollection(db, id, input)))
  )
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
  return logged('collection:delete', { id }, dropping(deleteCollection(db, id)))
}

/**
 * One file onto one shelf, carrying the batch's tags. No rating: an image's tier is its
 * shelf's.
 *
 * The bytes are read here rather than sent across the bridge: a 50MB image would be copied
 * twice to make the trip and the renderer has no reason to hold it at all.
 */
export async function uploadToCollection(request: {
  collectionId: number
  path: string
  sourceUrl: string
  tagIds: number[]
}): Promise<UploadResult> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'Not set up yet' }

  const store = boardStore()
  if (!store) return { ok: false, error: 'Not set up yet' }

  const detail = {
    collectionId: request.collectionId,
    path: request.path,
    sourceUrl: request.sourceUrl,
    tagIds: request.tagIds,
  }
  // An async arrow rather than a nested function, so `db` and `store` stay narrowed.
  const upload = async (): Promise<UploadResult> => {
    let bytes: Buffer
    try {
      bytes = await readFile(request.path)
    } catch {
      return { ok: false, error: 'Could not read the file — has it moved?' }
    }
    Object.assign(detail, { bytes: bytes.length })
    return dropping(
      createCollectionPostFromImage(
        db,
        store,
        bytes,
        {
          collectionId: request.collectionId,
          sourceUrl: request.sourceUrl,
          tagIds: request.tagIds,
        },
        DESKTOP_UPLOAD_LIMITS
      )
    )
  }
  return logged('collection:upload', detail, upload(), (result) => ({
    postId: result.postId,
  }))
}

/** A collection image's source — the whole of what there is to edit on one image. */
export async function saveCollectionPost(id: number, sourceUrl: string): Promise<Outcome> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'Not set up yet' }
  return logged(
    'collection:edit-image',
    { id, sourceUrl },
    dropping(updateCollectionPost(db, id, { source_url: sourceUrl }))
  )
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
  return logged(
    'collection:move-images',
    { ids, collectionId },
    dropping(moveCollectionPosts(db, ids, collectionId)),
    (result) => ({ moved: result.moved })
  )
}

/**
 * Removes an image from a shelf and deletes both stored objects.
 *
 * Row first, files second, and the row is read before either: a failed delete leaves the
 * image whole, and the paths derive from `file_name`, which nothing else stores. Both halves
 * are logged, and a failure of either is raised in the window as a notice — the storage one
 * after the answer is already `ok`, since the image the window asked about is gone.
 */
export async function removeCollectionPost(id: number): Promise<Outcome> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'Not set up yet' }

  const post = await getCollectionPost(db, id)
  const detail = {
    id,
    collectionId: post?.collection_id,
    fileName: post?.file_name,
    fileExt: post?.file_ext,
  }
  const deleteRow = async (): Promise<Outcome> => {
    if (!post) return { ok: false, error: `Image ${id} not found.` }
    try {
      const gone = await dropping(deleteCollectionPostRow(db, id))
      return gone ? { ok: true } : { ok: false, error: `Image ${id} not found.` }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Delete failed.' }
    }
  }
  const deleted = await logged('collection:delete-image', detail, deleteRow())
  if (!deleted.ok || !post) return deleted

  await removeStoredObjects(
    boardStore(),
    [collectionImagePath(post.file_name, post.file_ext), collectionThumbnailPath(post.file_name)],
    'collection:delete-image',
    detail
  )
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
