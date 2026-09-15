import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  collectionThumbnailDataUrl,
  makeCollection,
  readCollectionPosts,
  readCollections,
  editCollection,
  removeCollection,
  moveCollectionImage,
  removeCollectionPost,
  saveCollectionPost,
  uploadToCollection,
} from './collections'
import { postIdSchema } from './ipc-parse'
import type { Collection, CollectionPostPage } from '@common/data/collections'
import type { CollectionInput } from '@common/data/collections-write'
import type { UploadResult } from '@common/upload/pipeline'

/** A collection's name and mark arrive from text boxes, so they are bounded here and settled
 *  by `readCollectionName` / `readCollectionMark` inside — the same division `tagNameSchema`
 *  and `readTagName` make. The rating is checked against `RATINGS` in `./collections`. */
const collectionSchema = z.object({
  name: z.string().max(200),
  mark: z.string().max(200),
  rating: z.string(),
})

const collectionPostsSchema = z.object({
  collectionId: z.number().int().positive(),
  after: z.number().int().positive().optional(),
  // A screenful belongs to the window drawing it, bounded here because it arrives from
  // the renderer — the same reasoning as `browseSchema`.
  perPage: z.number().int().min(1).max(200).optional(),
})

const collectionUploadSchema = z.object({
  collectionId: z.number().int().positive(),
  path: z.string().min(1),
  rating: z.string(),
  sourceUrl: z.string(),
})

const collectionSavePostSchema = z.object({
  id: postIdSchema,
  rating: z.string(),
  sourceUrl: z.string(),
})

/** The shelf of images that are not posts. None of these takes a board: a collection is
 *  not one (`@common/collections`), so the switch in the header means nothing here. */
export function registerCollectionIpc(): void {
  ipcMain.handle('collections:list', async (): Promise<Collection[]> => readCollections())

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
   * One file onto one shelf — `post:upload` with the tags taken out, and the bytes read
   * here for the same reason: a 50MB image would be copied twice to cross the bridge.
   *
   * Nothing patches a cache afterwards. An upload to a shelf moves no `post_count`, coins
   * no tag and changes no name, so the tag index is still exactly right.
   */
  ipcMain.handle('collections:upload', async (_event, raw: unknown): Promise<UploadResult> => {
    const parsed = collectionUploadSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: 'Nothing to upload' }
    return uploadToCollection(parsed.data)
  })

  ipcMain.handle('collections:save-post', async (_event, raw: unknown) => {
    const parsed = collectionSavePostSchema.safeParse(raw)
    if (!parsed.success) return { ok: false as const, error: 'Nothing to save' }
    return saveCollectionPost(parsed.data.id, parsed.data.rating, parsed.data.sourceUrl)
  })

  ipcMain.handle('collections:move-post', async (_event, id: unknown, collection: unknown) => {
    const parsedId = postIdSchema.safeParse(id)
    const parsedCollection = postIdSchema.safeParse(collection)
    if (!parsedId.success) return { ok: false as const, error: 'No such image' }
    if (!parsedCollection.success) return { ok: false as const, error: 'No such collection' }
    return moveCollectionImage(parsedId.data, parsedCollection.data)
  })

  ipcMain.handle('collections:delete-post', async (_event, id: unknown) => {
    const parsed = postIdSchema.safeParse(id)
    if (!parsed.success) return { ok: false as const, error: 'No such image' }
    return removeCollectionPost(parsed.data)
  })

  ipcMain.handle('collections:thumbnail', async (_event, fileName: unknown): Promise<string> => {
    // Still the md5 shape, as `posts:thumbnail` checks: `file_name` holds the md5 of the
    // bytes, so anything else is not a name this board ever wrote.
    const parsed = z
      .string()
      .regex(/^[0-9a-f]{32}$/)
      .safeParse(fileName)
    return parsed.success ? collectionThumbnailDataUrl(parsed.data) : ''
  })
}
