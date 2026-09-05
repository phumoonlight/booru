import { readFile } from 'node:fs/promises'
import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'
import { z } from 'zod'
import { listTags, searchTags } from '@common/data/shared'
import * as manageTags from '@common/data/tags'
import { searchPosts } from '@common/data/search'
import { createPostFromImage, parsePostMetadata } from '@common/upload/pipeline'
import { CATEGORY_PATTERN } from '@common/tags'
import { DESKTOP_UPLOAD_LIMITS } from './limits'
import { CPU_COUNT, DEFAULT_ENCODE_PRIORITY, DEFAULT_ENCODE_THREADS } from './cpu'
import { loadConfig, revealSaveFile } from './config'
import { loadPreferences, savePreferences } from './preferences'
import { loadImplications, saveImplications } from './implications'
import { loadRecommendations, saveRecommendations } from './recommendations'
import { previewFile, stageFiles } from './staging'
import { downloadImages } from './download'
import { setQueueState } from './queue-guard'
import {
  cachedIndex,
  cachedSuggestions,
  clearTagCache,
  tagCacheStatus,
  TAG_INDEX_LIMIT,
} from './tag-cache'
import { boardClient } from './supabase'
import { loadPost, removePost, savePost, thumbnailDataUrl, type LoadedPost } from './manage'
import type { AppStatus, PreferencesInput, TagSuggestion } from '../shared/api'
import type { ImplicationRules } from '../shared/implications'
import type { RecommendationRules } from '../shared/recommendations'
import type { Tag } from '@common/tags'
import type { PostPage } from '@common/data/posts'
import type { UploadResult } from '@common/upload/pipeline'

/**
 * Every channel the window can reach. Each one is small on purpose: the renderer holds
 * no keys and no file access, so anything it needs is a request across here, and a
 * handler that doesn't exist is a capability the window doesn't have.
 *
 * The arguments arrive from a page and are treated that way — parsed, not trusted.
 */

// Defaulted rather than required, so a half-filled message from the window still lands
// on something usable; `savePreferences` clamps whatever comes through here anyway.
const preferencesSchema = z.object({
  encodeThreads: z.number().optional().default(DEFAULT_ENCODE_THREADS),
  encodePriority: z
    .enum(['low', 'below-normal', 'normal'])
    .optional()
    .default(DEFAULT_ENCODE_PRIORITY),
})

const postIdSchema = z.number().int().positive()

const browseSchema = z.object({
  query: z.string().max(500).optional().default(''),
  after: z.number().int().positive().optional(),
})

const savePostSchema = z.object({
  id: postIdSchema,
  tags: z.string(),
  rating: z.string(),
  sourceUrl: z.string(),
})

const tagNameSchema = z.string().max(64)
// Letters only, not one of five names: the column is free-form text and the Tags screen
// now offers the known categories as suggestions rather than as the whole vocabulary.
// The pattern is still the guard — a category reaches the board from this window alone.
const categorySchema = z.string().regex(CATEGORY_PATTERN)

const queueStateSchema = z.object({
  pending: z.number().int().nonnegative(),
  uploaded: z.number().int().nonnegative(),
  busy: z.boolean(),
})

const uploadSchema = z.object({
  path: z.string().min(1),
  tags: z.string(),
  rating: z.string(),
  sourceUrl: z.string(),
})

/** Only http(s) is ever handed to the OS — see the `shell:open-external` handler. */
function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

export function registerIpc(): void {
  ipcMain.handle('app:status', async (): Promise<AppStatus> => {
    const config = loadConfig()
    const preferences = loadPreferences()
    return {
      configured: config !== null,
      siteUrl: config?.siteUrl ?? '',
      supabaseUrl: config?.supabaseUrl ?? '',
      // Read here rather than baked into the bundle: the renderer has no `process`, and
      // `app.getVersion()` is the version electron-builder actually stamped on the copy.
      versions: {
        app: app.getVersion(),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
      },
      limits: DESKTOP_UPLOAD_LIMITS,
      tagCache: tagCacheStatus(),
      // The settings screen needs the machine's core count to bound the field it offers,
      // and what is actually in effect to show before anything has been saved.
      cpu: {
        count: CPU_COUNT,
        threads: preferences.encodeThreads,
        priority: preferences.encodePriority,
      },
    }
  })

  /**
   * The only settings there are. Nothing here can fail in a way worth reporting — the
   * values are clamped, not validated — so the answer is what was actually stored, and
   * the screen shows that rather than what was typed. Both take effect on the next
   * image, not the next launch, except raising the priority again on a POSIX host, which
   * `main/cpu.ts` explains.
   */
  ipcMain.handle(
    'app:save-preferences',
    async (_event, raw: unknown): Promise<PreferencesInput> => {
      const parsed = preferencesSchema.safeParse(raw)
      return savePreferences(parsed.success ? parsed.data : {})
    }
  )

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

  ipcMain.handle('files:stage', async (_event, paths: unknown) => {
    const parsed = z.array(z.string().min(1)).max(200).safeParse(paths)
    return parsed.success ? stageFiles(parsed.data) : []
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
  ipcMain.handle('files:fetch', async (_event, urls: unknown) => {
    const parsed = z.array(z.url()).max(50).safeParse(urls)
    return parsed.success ? downloadImages(parsed.data) : []
  })

  /**
   * The board's whole tag index, for the Tags screen — the same read behind the web's
   * /tags page, capped the same way. Grouping and sorting are the screen's, not this
   * handler's: the cap is decided by post count and the display order isn't.
   */
  ipcMain.handle('tags:list', async (): Promise<Tag[]> => {
    // The cache is the same read, kept for a day — `main/tag-cache.ts`. It falls through
    // to the board only when there is nothing cached and nothing it could fill from.
    const cached = await cachedIndex()
    if (cached) return cached

    const supabase = boardClient()
    if (!supabase) return []
    return listTags(supabase, TAG_INDEX_LIMIT)
  })

  /**
   * Autocomplete for the tag field. Answered from the day-old copy of the index whenever
   * there is one, which is nearly always and costs nothing; the query behind the fallback
   * is the same one the web's `suggestTags` action runs.
   */
  ipcMain.handle('tags:suggest', async (_event, query: unknown): Promise<TagSuggestion[]> => {
    const parsed = z.string().max(64).safeParse(query)
    if (!parsed.success) return []

    const suggest = (tags: Tag[]): TagSuggestion[] =>
      tags.map(({ name, category, post_count }) => ({ name, category, post_count }))

    const cached = await cachedSuggestions(parsed.data)
    if (cached) return suggest(cached)

    const supabase = boardClient()
    if (!supabase) return []
    return suggest(await searchTags(supabase, parsed.data))
  })

  /**
   * Throws the cached index away, for when it has somehow gone wrong — a tag renamed on
   * the board, a machine whose clock jumped. The next lookup reads the board again, so
   * there is nothing to confirm and nothing to wait for.
   */
  ipcMain.handle('tags:clear-cache', async (): Promise<void> => clearTagCache())

  /**
   * The tag implication rules, which are this machine's and not the board's — no session
   * is needed to read or write them, and nothing here reaches Supabase.
   *
   * `saveImplications` is the whole rule set every time rather than one rule at a time.
   * The set is small, the file is rewritten either way, and a screen that sends what it
   * is showing cannot drift from what is stored.
   */
  ipcMain.handle('implications:list', async (): Promise<ImplicationRules> => loadImplications())

  // No zod here: `normalizeRules` inside is the parse, and a stricter one — it holds
  // every name to the board's own `TAG_PATTERN`, which a schema of this shape would not.
  ipcMain.handle(
    'implications:save',
    async (_event, raw: unknown): Promise<ImplicationRules> => saveImplications(raw)
  )

  /** The same two channels for the rules that are offered rather than applied. */
  ipcMain.handle(
    'recommendations:list',
    async (): Promise<RecommendationRules> => loadRecommendations()
  )

  ipcMain.handle(
    'recommendations:save',
    async (_event, raw: unknown): Promise<RecommendationRules> => saveRecommendations(raw)
  )

  /**
   * One file, one post — the same one-call-per-image shape the web queue uses, so each
   * row keeps its own progress and its own failure.
   *
   * The bytes are read here rather than sent across the bridge: a 50MB image would be
   * copied twice to make the trip, and the renderer has no reason to hold it at all.
   */
  ipcMain.handle('post:upload', async (_event, raw: unknown): Promise<UploadResult> => {
    const parsed = uploadSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: 'Nothing to upload' }

    const supabase = boardClient()
    if (!supabase) return { ok: false, error: 'Not set up yet' }

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

    const result = await createPostFromImage(
      supabase,
      bytes,
      metadata.metadata,
      DESKTOP_UPLOAD_LIMITS
    )
    // A post creates tags and moves counts, so the cached index is now wrong in exactly
    // the way that matters: the tag just coined is the one you are about to type again.
    if (result.ok) clearTagCache()
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

    const supabase = boardClient()
    if (!supabase) return empty
    return searchPosts(supabase, { query: parsed.data.query, after: parsed.data.after })
  })

  /** One post and its tags — what the editor opens with. */
  ipcMain.handle('posts:get', async (_event, id: unknown): Promise<LoadedPost | null> => {
    const parsed = postIdSchema.safeParse(id)
    return parsed.success ? loadPost(parsed.data) : null
  })

  ipcMain.handle('posts:save', async (_event, raw: unknown) => {
    const parsed = savePostSchema.safeParse(raw)
    if (!parsed.success) return { ok: false as const, error: 'Nothing to save' }
    const { id, tags, rating, sourceUrl } = parsed.data
    return savePost(id, tags, rating, sourceUrl)
  })

  ipcMain.handle('posts:delete', async (_event, id: unknown) => {
    const parsed = postIdSchema.safeParse(id)
    if (!parsed.success) return { ok: false as const, error: 'No such post' }
    return removePost(parsed.data)
  })

  /**
   * A thumbnail, as a data: URL. The window's CSP lets it load `self` and `data:` and
   * nothing else, which is worth more than the round trip this costs — `main/manage.ts`.
   */
  ipcMain.handle('posts:thumbnail', async (_event, fileName: unknown): Promise<string> => {
    // Still the md5 shape: `file_name` is what the column is called, and the md5 of the
    // bytes is what it holds, so anything else is not a name this board ever wrote.
    const parsed = z.string().regex(/^[0-9a-f]{32}$/).safeParse(fileName)
    return parsed.success ? thumbnailDataUrl(parsed.data) : ''
  })

  // ── The tag vocabulary ───────────────────────────────────────────────
  // The five operations that were /tags/manage. Each one answers `{ ok }` or
  // `{ error }`; the validation is `@common/data/tags`, which is also what the web's
  // forms used, so a name rejected here is rejected in the same words.
  //
  // Every one of them drops the cached index: a rename, a delete or a category change
  // makes the copy on disk wrong about a name the field is about to offer.

  ipcMain.handle('tags:create', async (_event, name: unknown, category: unknown) => {
    const supabase = boardClient()
    if (!supabase) return { ok: false as const, error: 'Not set up yet' }
    const parsedName = tagNameSchema.safeParse(name)
    const parsedCategory = categorySchema.safeParse(category)
    if (!parsedName.success) return { ok: false as const, error: 'Type a tag name.' }
    if (!parsedCategory.success) return { ok: false as const, error: 'Pick a category.' }

    const result = await manageTags.createTag(supabase, parsedName.data, parsedCategory.data)
    if (result.ok) clearTagCache()
    return result
  })

  ipcMain.handle('tags:rename', async (_event, id: unknown, name: unknown) => {
    const supabase = boardClient()
    if (!supabase) return { ok: false as const, error: 'Not set up yet' }
    const parsedId = postIdSchema.safeParse(id)
    const parsedName = tagNameSchema.safeParse(name)
    if (!parsedId.success) return { ok: false as const, error: 'No such tag' }
    if (!parsedName.success) return { ok: false as const, error: 'Type a tag name.' }

    const result = await manageTags.renameTag(supabase, parsedId.data, parsedName.data)
    if (result.ok) clearTagCache()
    return result
  })

  ipcMain.handle('tags:set-category', async (_event, id: unknown, category: unknown) => {
    const supabase = boardClient()
    if (!supabase) return { ok: false as const, error: 'Not set up yet' }
    const parsedId = postIdSchema.safeParse(id)
    const parsedCategory = categorySchema.safeParse(category)
    if (!parsedId.success) return { ok: false as const, error: 'No such tag' }
    if (!parsedCategory.success) return { ok: false as const, error: 'Pick a category.' }

    const result = await manageTags.setTagCategory(supabase, parsedId.data, parsedCategory.data)
    if (result.ok) clearTagCache()
    return result
  })

  ipcMain.handle('tags:delete', async (_event, id: unknown) => {
    const supabase = boardClient()
    if (!supabase) return { ok: false as const, error: 'Not set up yet' }
    const parsedId = postIdSchema.safeParse(id)
    if (!parsedId.success) return { ok: false as const, error: 'No such tag' }

    const result = await manageTags.deleteTag(supabase, parsedId.data)
    if (result.ok) clearTagCache()
    return result
  })

  /**
   * Apply one tag to every post already carrying another. The slowest thing this app
   * does — it reads every link on both tags and can insert thousands of rows — so it
   * answers with the counts rather than a bare ok: "added to 3, 41 already had it" is
   * the difference between a rule that did something and one already satisfied.
   */
  ipcMain.handle('tags:apply', async (_event, target: unknown, condition: unknown) => {
    const supabase = boardClient()
    if (!supabase) return { ok: false as const, error: 'Not set up yet' }
    const parsedTarget = tagNameSchema.safeParse(target)
    const parsedCondition = tagNameSchema.safeParse(condition)
    if (!parsedTarget.success || !parsedCondition.success) {
      return { ok: false as const, error: 'Type a tag name.' }
    }

    const result = await manageTags.applyTagToTagged(
      supabase,
      parsedTarget.data,
      parsedCondition.data
    )
    if (result.ok) clearTagCache()
    return result
  })

  /**
   * The queue's size, pushed on every change. `on`, not `handle`: nothing is returned and
   * nothing waits for it. Parsed like everything else here, and a message that doesn't fit
   * the shape is dropped rather than left to make the close dialog lie about the count.
   */
  ipcMain.on('queue:state', (_event, state: unknown) => {
    const parsed = queueStateSchema.safeParse(state)
    if (parsed.success) setQueueState(parsed.data)
  })

  /** Shows `save.json` in Explorer/Finder — the settings screen's "where is this?". */
  ipcMain.handle('shell:open-data-folder', async (): Promise<void> => revealSaveFile())

  /**
   * Only ever a post on the board. `openExternal` hands the string to the OS, which will
   * happily run a `file:` or a custom-scheme URL, so the scheme is checked rather than
   * assumed — the renderer builds these from a site URL the user typed into settings.
   */
  ipcMain.handle('shell:open-external', async (_event, url: unknown): Promise<void> => {
    if (typeof url !== 'string') return
    if (!isWebUrl(url)) return
    await shell.openExternal(url)
  })
}
