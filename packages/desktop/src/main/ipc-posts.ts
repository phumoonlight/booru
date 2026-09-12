import { readFile } from 'node:fs/promises'
import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import { z } from 'zod'
import { BOARDS } from '@common/board'
import { searchPosts } from '@common/data/search'
import { createPostFromImage, parsePostMetadata } from '@common/upload/pipeline'
import { parseTagInput } from '@common/tags'
import { DESKTOP_UPLOAD_LIMITS } from './limits'
import { previewFile, stageFiles } from './staging'
import { downloadImages } from './download'
import { bumpTagCounts } from './tag-cache'
import { clearBrowseCache, readBrowseCache, writeBrowseCache } from './browse-cache'
import { boardDb } from './db'
import { boardStore } from './r2'
import { loadPost, removePost, savePost, thumbnailDataUrl, type LoadedPost } from './manage'
import { boardSchema, postIdSchema, readBoard } from './ipc-parse'
import type { BrowseCacheFile } from '../shared/api'
import type { PostPage } from '@common/data/posts'
import type { UploadResult } from '@common/upload/pipeline'

const browseSchema = z.object({
  query: z.string().max(500).optional().default(''),
  board: boardSchema,
  after: z.number().int().positive().optional(),
  // How big a screenful is belongs to the window drawing it, not to this process and not
  // to `@common/data/search`, whose default is the website's page size. Bounded here
  // because the number arrives from the renderer.
  perPage: z.number().int().min(1).max(100).optional(),
})

/**
 * The grid the window is holding, on its way to disk. A row is a post this process handed
 * out in the first place, so the check is the envelope rather than the shape of a post:
 * enough that a file written from here can only be read back as a grid, and not a second
 * definition of `Post` to keep in step with the first.
 */
const browseCacheSchema = z.object({
  query: z.string().max(500),
  board: boardSchema,
  hasMore: z.boolean(),
  posts: z.array(z.looseObject({ id: z.number().int().positive() })).max(2000),
})

const savePostSchema = z.object({
  id: postIdSchema,
  board: boardSchema,
  tags: z.string(),
  rating: z.string(),
  sourceUrl: z.string(),
})

/**
 * Where a batch of files is being staged to. `'collection'` beside the two boards, because
 * that is the only thing the duplicate check needs to tell apart — see `StageTarget`.
 */
const stageTargetSchema = z
  .enum([...BOARDS, 'collection'])
  .optional()
  .default('post')

const uploadSchema = z.object({
  path: z.string().min(1),
  board: boardSchema,
  tags: z.string(),
  rating: z.string(),
  sourceUrl: z.string(),
})

/** Everything about an image: picking one, staging it, uploading it, and reading back the
 *  posts already on the board — which is also the browse grid and the cache behind it. */
export function registerPostIpc(): void {
  ipcMain.handle('files:choose', async (event): Promise<string[]> => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options: OpenDialogOptions = {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'] }],
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('files:stage', async (_event, paths: unknown, target: unknown) => {
    const parsed = z.array(z.string().min(1)).max(200).safeParse(paths)
    // The target is here because staging asks the duplicate question, and where it is
    // asked decides the answer: the same bytes on the gallery and on the AI board are two
    // posts, and the same bytes on a shelf are one image wherever it is shelved.
    return parsed.success ? stageFiles(parsed.data, stageTargetSchema.parse(target)) : []
  })

  /**
   * The full-size look a clicked row asks for. Deliberately not part of staging: the
   * queue would otherwise be carrying one of these per file, in the window, forever.
   * The path is checked against the queue by nothing — it is one the renderer was given
   * by `files:stage`, and reading an image the user picked is what this app is for.
   */
  ipcMain.handle('files:preview', async (_event, path: unknown): Promise<string> => {
    const parsed = z.string().min(1).safeParse(path)
    return parsed.success ? previewFile(parsed.data) : ''
  })

  /**
   * Images dragged in from a browser arrive as links, not files — see `main/download.ts`.
   * The addresses come from a page, so they are parsed as URLs before anything fetches
   * them, and the handler answers in the same shape `files:stage` does.
   */
  ipcMain.handle('files:fetch', async (_event, urls: unknown, target: unknown) => {
    const parsed = z.array(z.url()).max(50).safeParse(urls)
    return parsed.success ? downloadImages(parsed.data, stageTargetSchema.parse(target)) : []
  })

  /**
   * The board's whole tag index, for the Tags screen — the same read behind the web's
   * /tags page, capped the same way. Grouping and sorting are the screen's, not this
   * handler's: the cap is decided by post count and the display order isn't.
  /**
   * The browse grid across restarts — `main/browse-cache.ts`. The window keeps its own
   * copy for the life of the process and only comes here on the way up and on the way
   * past: reading once at startup, writing whenever the rows on screen change, and
   * dropping when 🔄 or a new search says what it holds is no longer what it wants.
   */
  ipcMain.handle(
    'browse:read-cache',
    async (_event, board: unknown): Promise<BrowseCacheFile | null> =>
      readBrowseCache(readBoard(board))
  )

  ipcMain.handle('browse:write-cache', async (_event, raw: unknown): Promise<void> => {
    const parsed = browseCacheSchema.safeParse(raw)
    // A grid that will not parse is one this build could not have drawn, so nothing is
    // written and the copy already on disk stands.
    if (!parsed.success) return
    const { query, posts, hasMore, board } = parsed.data
    writeBrowseCache({ at: Date.now(), query, posts: posts as PostPage['posts'], hasMore }, board)
  })

  ipcMain.handle('browse:clear-cache', async (_event, board: unknown): Promise<void> =>
    clearBrowseCache(readBoard(board))
  )

  /**
   * The tag rules, which are the board's now rather than this machine's — they moved off
   * `save.json` and onto `tag_rules`, so they follow a rename, die with a delete, and are
   * the same rules on every install.
   *
   * `rules:save` writes one tag's whole list rather than the whole map. The panel that
   * edits a rule has exactly one tag open, so that is what it was always sending; what
   * One file, one post — the same one-call-per-image shape the web queue uses, so each
   * row keeps its own progress and its own failure.
   *
   * The bytes are read here rather than sent across the bridge: a 50MB image would be
   * copied twice to make the trip, and the renderer has no reason to hold it at all.
   */
  ipcMain.handle('post:upload', async (_event, raw: unknown): Promise<UploadResult> => {
    const parsed = uploadSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: 'Nothing to upload' }

    const db = boardDb()
    if (!db) return { ok: false, error: 'Not set up yet' }

    const metadata = parsePostMetadata({
      tags: parsed.data.tags,
      rating: parsed.data.rating,
      source_url: parsed.data.sourceUrl,
    })
    if (!metadata.ok) return { ok: false, error: metadata.error }

    let bytes: Buffer
    try {
      bytes = await readFile(parsed.data.path)
    } catch {
      return { ok: false, error: 'Could not read the file — has it moved?' }
    }

    const store = boardStore()
    if (!store) return { ok: false, error: 'Not set up yet' }

    const result = await createPostFromImage(
      db,
      store,
      bytes,
      metadata.metadata,
      DESKTOP_UPLOAD_LIMITS,
      parsed.data.board
    )
    // An upload moves `post_count` and moves nothing else — it cannot coin a tag, so no
    // name, category, mark or section in the cached index can have changed. The counts of
    // the tags it applied are patched in place rather than the whole index being thrown
    // away: dropping it meant the next tag field re-read the entire board, once per
    // upload. `bumpTagCounts` has why +1 is exact and needs no query. Only this board's
    // copy moves; the same tags on the other board gained nothing.
    if (result.ok) bumpTagCounts(parseTagInput(parsed.data.tags).tags, 1, parsed.data.board)
    return result
  })
  // ── Managing what is already on the board ────────────────────────────────────
  // These came off the website when it lost its login. `posts:search` runs the same
  // query the gallery does — `@common/data/search`, one grammar — so a query typed in
  // the browse box means exactly what it means in the site's search bar.

  ipcMain.handle('posts:search', async (_event, raw: unknown): Promise<PostPage> => {
    const parsed = browseSchema.safeParse(raw ?? {})
    const empty: PostPage = { posts: [], hasMore: false }
    if (!parsed.success) return empty

    const db = boardDb()
    if (!db) return empty
    return searchPosts(db, {
      query: parsed.data.query,
      after: parsed.data.after,
      perPage: parsed.data.perPage,
      board: parsed.data.board,
    })
  })

  /** One post and its tags — what the editor opens with. */
  ipcMain.handle(
    'posts:get',
    async (_event, id: unknown, board: unknown): Promise<LoadedPost | null> => {
      const parsed = postIdSchema.safeParse(id)
      return parsed.success ? loadPost(parsed.data, readBoard(board)) : null
    }
  )

  ipcMain.handle('posts:save', async (_event, raw: unknown) => {
    const parsed = savePostSchema.safeParse(raw)
    if (!parsed.success) return { ok: false as const, error: 'Nothing to save' }
    const { id, tags, rating, sourceUrl, board } = parsed.data
    return savePost(id, tags, rating, sourceUrl, board)
  })

  ipcMain.handle('posts:delete', async (_event, id: unknown, board: unknown) => {
    const parsed = postIdSchema.safeParse(id)
    if (!parsed.success) return { ok: false as const, error: 'No such post' }
    return removePost(parsed.data, readBoard(board))
  })

  /**
   * A thumbnail, as a data: URL. The window's CSP lets it load `self` and `data:` and
   * nothing else, which is worth more than the round trip this costs — `main/manage.ts`.
   */
  ipcMain.handle(
    'posts:thumbnail',
    async (_event, fileName: unknown, board: unknown): Promise<string> => {
      // Still the md5 shape: `file_name` is what the column is called, and the md5 of the
      // bytes is what it holds, so anything else is not a name this board ever wrote.
      const parsed = z
        .string()
        .regex(/^[0-9a-f]{32}$/)
        .safeParse(fileName)
      return parsed.success ? thumbnailDataUrl(parsed.data, readBoard(board)) : ''
    }
  )
}
