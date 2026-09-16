import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  collectionImageDataUrl,
  collectionThumbnailDataUrl,
  editCollectionTag,
  makeCollection,
  makeCollectionTag,
  readCollectionTags,
  readPostTags,
  removeCollectionTag,
  tagCollectionPosts,
  readCollectionPosts,
  readCollections,
  editCollection,
  removeCollection,
  moveCollectionImages,
  removeCollectionPost,
  saveCollectionPost,
  uploadToCollection,
} from './collections'
import { postIdSchema } from './ipc-parse'
import { COLLECTION_TAG_FILTER_MAX, COLLECTION_TAG_MAX } from '@common/collections'
import type { Collection, CollectionPostPage } from '@common/data/collections'
import type { CollectionTag } from '@common/data/collection-tags'
import type { CollectionInput } from '@common/data/collections-write'
import type { UploadResult } from '@common/upload/pipeline'

/** A collection's name and mark arrive from text boxes, so they are bounded here and settled
 *  by `readCollectionName` / `readCollectionMark` inside — the same division `tagNameSchema`
 *  and `readTagName` make. The rating is checked against `RATINGS` in `./collections`. */
const collectionSchema = z.object({
  name: z.string().max(200),
  mark: z.string().max(200),
  rating: z.string(),
  is_ai: z.boolean(),
})

const collectionPostsSchema = z.object({
  collectionId: z.number().int().positive(),
  after: z.number().int().positive().optional(),
  // A screenful belongs to the window drawing it, bounded here because it arrives from
  // the renderer.
  perPage: z.number().int().min(1).max(200).optional(),
  // The lit pills, by name — bounded like the website's URL is, and settled against the
  // table by the query rather than here: a name the shelf does not have matches nothing.
  tags: z.array(z.string().max(COLLECTION_TAG_MAX)).max(COLLECTION_TAG_FILTER_MAX).optional(),
})

/** A tag's name and mark arrive from text boxes: bounded here, settled by
 *  `readCollectionTagName` and `readCollectionTagMark`. */
const tagInputSchema = z.object({ name: z.string().max(200), mark: z.string().max(200) })

const tagPostsSchema = z.object({
  tagId: postIdSchema,
  postIds: z.array(postIdSchema).min(1).max(1000),
  on: z.boolean(),
})

const collectionUploadSchema = z.object({
  collectionId: z.number().int().positive(),
  path: z.string().min(1),
  sourceUrl: z.string(),
})

const collectionSavePostSchema = z.object({
  id: postIdSchema,
  sourceUrl: z.string(),
})

/** The shelves: what the website draws, and the only images this app puts there. */
export function registerCollectionIpc(): void {
  /** `force` is 🔄 Refresh: the list is cached for a day (`main/collection-cache.ts`), and
   *  that press is the one whose whole meaning is "ask the board again". */
  ipcMain.handle('collections:list', async (_event, force: unknown): Promise<Collection[]> =>
    readCollections(force === true)
  )

  ipcMain.handle('collections:create', async (_event, raw: unknown) => {
    const parsed = collectionSchema.safeParse(raw)
    if (!parsed.success) return { ok: false as const, error: 'Type a name for the collection.' }
    return makeCollection(parsed.data as CollectionInput)
  })

  ipcMain.handle('collections:edit', async (_event, id: unknown, raw: unknown) => {
    const parsedId = postIdSchema.safeParse(id)
    const parsed = collectionSchema.safeParse(raw)
    if (!parsedId.success) return { ok: false as const, error: 'No such collection' }
    if (!parsed.success) return { ok: false as const, error: 'Type a name for the collection.' }
    return editCollection(parsedId.data, parsed.data as CollectionInput)
  })

  /**
   * Refused while the shelf still holds anything, which is the one rule this feature has —
   * `deleteCollection` counts first so the refusal can say how many are in the way, and the
   * foreign key refuses it regardless.
   */
  ipcMain.handle('collections:delete', async (_event, id: unknown) => {
    const parsed = postIdSchema.safeParse(id)
    if (!parsed.success) return { ok: false as const, error: 'No such collection' }
    return removeCollection(parsed.data)
  })

  ipcMain.handle('collections:posts', async (_event, raw: unknown): Promise<CollectionPostPage> => {
    const parsed = collectionPostsSchema.safeParse(raw ?? {})
    if (!parsed.success) return { posts: [], hasMore: false }
    return readCollectionPosts(parsed.data)
  })

  /**
   * One file onto one shelf, the bytes read here: a 50MB image would be copied twice to
   * cross the bridge. Nothing patches a cache afterwards — an upload to a shelf touches no
   * tag, so the tag index is still exactly right.
   */
  ipcMain.handle('collections:upload', async (_event, raw: unknown): Promise<UploadResult> => {
    const parsed = collectionUploadSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: 'Nothing to upload' }
    return uploadToCollection(parsed.data)
  })

  ipcMain.handle('collections:save-post', async (_event, raw: unknown) => {
    const parsed = collectionSavePostSchema.safeParse(raw)
    if (!parsed.success) return { ok: false as const, error: 'Nothing to save' }
    return saveCollectionPost(parsed.data.id, parsed.data.sourceUrl)
  })

  // A selection, bounded here because it arrives from the renderer: every image loaded on a
  // shelf is a few chunks, and a thousand is well past any screen of them.
  ipcMain.handle('collections:move-posts', async (_event, ids: unknown, collection: unknown) => {
    const parsedIds = z.array(postIdSchema).min(1).max(1000).safeParse(ids)
    const parsedCollection = postIdSchema.safeParse(collection)
    if (!parsedIds.success) return { ok: false as const, error: 'Nothing selected' }
    if (!parsedCollection.success) return { ok: false as const, error: 'No such collection' }
    return moveCollectionImages([...new Set(parsedIds.data)], parsedCollection.data)
  })

  ipcMain.handle('collections:delete-post', async (_event, id: unknown) => {
    const parsed = postIdSchema.safeParse(id)
    if (!parsed.success) return { ok: false as const, error: 'No such image' }
    return removeCollectionPost(parsed.data)
  })

  // A shelf's own tags. Made on the shelf, then put on its images — never coined by the
  // write that puts one on an image, which takes an id.

  ipcMain.handle('collections:tags', async (_event, id: unknown): Promise<CollectionTag[]> => {
    const parsed = postIdSchema.safeParse(id)
    return parsed.success ? readCollectionTags(parsed.data) : []
  })

  ipcMain.handle('collections:post-tags', async (_event, id: unknown) => {
    const parsed = postIdSchema.safeParse(id)
    return parsed.success ? readPostTags(parsed.data) : []
  })

  ipcMain.handle('collections:create-tag', async (_event, id: unknown, raw: unknown) => {
    const parsedId = postIdSchema.safeParse(id)
    const parsed = tagInputSchema.safeParse(raw)
    if (!parsedId.success) return { ok: false as const, error: 'No such collection' }
    if (!parsed.success) return { ok: false as const, error: 'Type a tag.' }
    return makeCollectionTag(parsedId.data, parsed.data)
  })

  ipcMain.handle('collections:edit-tag', async (_event, id: unknown, raw: unknown) => {
    const parsedId = postIdSchema.safeParse(id)
    const parsed = tagInputSchema.safeParse(raw)
    if (!parsedId.success) return { ok: false as const, error: 'No such tag' }
    if (!parsed.success) return { ok: false as const, error: 'Type a tag.' }
    return editCollectionTag(parsedId.data, parsed.data)
  })

  ipcMain.handle('collections:delete-tag', async (_event, id: unknown) => {
    const parsed = postIdSchema.safeParse(id)
    if (!parsed.success) return { ok: false as const, error: 'No such tag' }
    return removeCollectionTag(parsed.data)
  })

  /** One tag on or off a set of images — the image panel's set of one, or the manage
   *  selection. Bounded like a move is. */
  ipcMain.handle('collections:tag-posts', async (_event, raw: unknown) => {
    const parsed = tagPostsSchema.safeParse(raw)
    if (!parsed.success) return { ok: false as const, error: 'Nothing selected' }
    return tagCollectionPosts({ ...parsed.data, postIds: [...new Set(parsed.data.postIds)] })
  })

  ipcMain.handle('collections:thumbnail', async (_event, fileName: unknown): Promise<string> => {
    // The md5 shape: `file_name` holds the md5 of the bytes, so anything else is not a name
    // this board ever wrote.
    const parsed = z
      .string()
      .regex(/^[0-9a-f]{32}$/)
      .safeParse(fileName)
    return parsed.success ? collectionThumbnailDataUrl(parsed.data) : ''
  })

  /** By id rather than by name, unlike the thumbnail: the stored object's extension is on
   *  the row, and only the row knows whether the AVIF or the original was kept. */
  ipcMain.handle('collections:image', async (_event, id: unknown): Promise<string> => {
    const parsed = postIdSchema.safeParse(id)
    return parsed.success ? collectionImageDataUrl(parsed.data) : ''
  })
}
