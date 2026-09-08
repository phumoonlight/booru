import { readFile } from 'node:fs/promises'
import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import { z } from 'zod'
import { listTags, searchTags } from '@common/data/shared'
import * as manageTags from '@common/data/tags'
import { searchPosts } from '@common/data/search'
import { createPostFromImage, parsePostMetadata } from '@common/upload/pipeline'
import { TAG_CATEGORIES, parseTagInput } from '@common/tags'
import { DESKTOP_UPLOAD_LIMITS } from './limits'
import { CPU_COUNT, DEFAULT_ENCODE_PRIORITY, DEFAULT_ENCODE_THREADS } from './cpu'
import { loadConfig, revealSaveFile } from './config'
import { loadPreferences, savePreferences } from './preferences'
import { listBrowsers, openUrl } from './browser'
import { loadRules, saveRule } from './rules'
import { loadCatalogs, saveCatalogs } from './catalogs'
import { loadFormSections, saveFormSections } from './form-sections'
import { previewFile, stageFiles } from './staging'
import { downloadImages } from './download'
import { setStagedState } from './close-guard'
import { exportSave, importSave } from './transfer'
import {
  bumpTagCounts,
  cachedIndex,
  cachedSuggestions,
  clearTagCache,
  tagCacheStatus,
  TAG_INDEX_LIMIT,
} from './tag-cache'
import { clearBrowseCache, readBrowseCache, writeBrowseCache } from './browse-cache'
import { boardDb } from './db'
import { boardStore } from './r2'
import { loadPost, removePost, savePost, thumbnailDataUrl, type LoadedPost } from './manage'
import type { FormSections } from '@common/data/form-sections'
import type { AppStatus, BrowseCacheFile, PreferencesInput, TagSuggestion } from '../shared/api'
import type { TagRules } from '@common/data/rules'
import type { TagCatalogs } from '../shared/catalogs'
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
  browser: z.string().max(500).optional().default(''),
})

const postIdSchema = z.number().int().positive()

const browseSchema = z.object({
  query: z.string().max(500).optional().default(''),
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
  hasMore: z.boolean(),
  posts: z.array(z.looseObject({ id: z.number().int().positive() })).max(2000),
})

const savePostSchema = z.object({
  id: postIdSchema,
  tags: z.string(),
  rating: z.string(),
  sourceUrl: z.string(),
})

const tagNameSchema = z.string().max(64)
// A ceiling, not the rule: `normalizeFormSection` settles the spelling of what gets
// through, and the unique constraint on `(category, name)` settles the rest.
const sectionSchema = z.string().max(64)
// A ceiling, not a rule: `readTagMark` is what decides a mark is a colour, or up to three
// glyphs, and not a bracket — and it answers a message the field can show. This only keeps
// a paste of a paragraph from reaching the board at all — generous, because three ZWJ
// sequences are a great many UTF-16 units and this is not the check that counts them.
const markSchema = z.string().max(96)
// The known list, which is also the only list with a colour and a place in the display
// order. A category outside it can only arrive by hand-editing the table.
const categorySchema = z.enum(TAG_CATEGORIES)
// Which of the three rule sets a channel is talking about. The same strings the table's
// `kind` column is checked against, so an unknown one is refused here rather than by a
// constraint violation three calls later.
// The five shapes one edit to the sections can take. A discriminated union rather than five
// channels — see the handler. It has to name every member of `FormSectionEdit`: a shape
// missing here is refused at the bridge, which is a channel error rather than the typed
// failure the panel knows how to show.
const sectionEditSchema = z.discriminatedUnion('do', [
  z.object({ do: z.literal('create'), category: categorySchema, name: sectionSchema }),
  z.object({ do: z.literal('rename'), id: z.number().int().positive(), name: sectionSchema }),
  z.object({ do: z.literal('delete'), id: z.number().int().positive() }),
  z.object({
    do: z.literal('reorder'),
    category: categorySchema,
    ids: z.array(z.number().int().positive()).max(200),
  }),
  z.object({
    do: z.literal('deps'),
    id: z.number().int().positive(),
    mode: z.enum(['any', 'all']),
    // Names, checked against the board by `resolveTagIds` inside — which refuses one it has
    // no tag for, the same refusal a post write and a tag rule make.
    names: z.array(z.string().max(64)).max(100),
  }),
])

const ruleKindSchema = z.enum(['implies', 'recommends'])

const stagedStateSchema = z.object({
  staged: z.boolean(),
  uploaded: z.boolean(),
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
      // The host, never the connection string — that carries a password, and the settings
      // screen is a readout somebody might screenshot. `URL.parse` returns null on
      // anything it cannot read, which for a value this build refused to be without means
      // a string shaped like no URL at all; showing nothing beats showing half of it.
      databaseHost: config ? (URL.parse(config.databaseUrl)?.hostname ?? '') : '',
      cdnUrl: config?.cdnUrl ?? '',
      // Read here rather than baked into the bundle: the renderer has no `process`, and
      // `app.getVersion()` is the version electron-builder actually stamped on the copy.
      versions: {
        app: app.getVersion(),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
      },
      development: !app.isPackaged,
      limits: DESKTOP_UPLOAD_LIMITS,
      tagCache: tagCacheStatus(),
      // The settings screen needs the machine's core count to bound the field it offers,
      // and what is actually in effect to show before anything has been saved.
      cpu: {
        count: CPU_COUNT,
        threads: preferences.encodeThreads,
        priority: preferences.encodePriority,
      },
      // Detected once per launch and cached, so re-reading status after every settings
      // write does not re-walk the registry.
      browser: { chosen: preferences.browser, options: await listBrowsers() },
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

    const db = boardDb()
    if (!db) return []
    return listTags(db, TAG_INDEX_LIMIT)
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

    const db = boardDb()
    if (!db) return []
    return suggest(await searchTags(db, parsed.data))
  })

  /**
   * Throws the cached index away, for when it has somehow gone wrong — a tag renamed on
   * the board, a machine whose clock jumped. The next lookup reads the board again, so
   * there is nothing to confirm and nothing to wait for.
   */
  ipcMain.handle('tags:clear-cache', async (): Promise<void> => clearTagCache())

  /**
   * The browse grid across restarts — `main/browse-cache.ts`. The window keeps its own
   * copy for the life of the process and only comes here on the way up and on the way
   * past: reading once at startup, writing whenever the rows on screen change, and
   * dropping when 🔄 or a new search says what it holds is no longer what it wants.
   */
  ipcMain.handle('browse:read-cache', async (): Promise<BrowseCacheFile | null> => readBrowseCache())

  ipcMain.handle('browse:write-cache', async (_event, raw: unknown): Promise<void> => {
    const parsed = browseCacheSchema.safeParse(raw)
    // A grid that will not parse is one this build could not have drawn, so nothing is
    // written and the copy already on disk stands.
    if (!parsed.success) return
    const { query, posts, hasMore } = parsed.data
    writeBrowseCache({ at: Date.now(), query, posts: posts as PostPage['posts'], hasMore })
  })

  ipcMain.handle('browse:clear-cache', async (): Promise<void> => clearBrowseCache())

  /**
   * The tag rules, which are the board's now rather than this machine's — they moved off
   * `save.json` and onto `tag_rules`, so they follow a rename, die with a delete, and are
   * the same rules on every install.
   *
   * `rules:save` writes one tag's whole list rather than the whole map. The panel that
   * edits a rule has exactly one tag open, so that is what it was always sending; what
   * changed is that the write now touches that tag alone instead of rewriting a file.
   */
  ipcMain.handle(
    'rules:list',
    async (_event, kind: unknown): Promise<TagRules> => loadRules(ruleKindSchema.parse(kind))
  )

  // Only the kind and the trigger are checked here. The list itself goes through
  // `normalizeRules` inside, which is the parse and a stricter one — it holds every name
  // to the board's own `TAG_PATTERN`, which a schema of this shape would not, and the
  // write beneath it refuses any name the board has no tag for.
  ipcMain.handle(
    'rules:save',
    async (_event, kind: unknown, tag: unknown, raw: unknown): Promise<TagRules> =>
      saveRule(ruleKindSchema.parse(kind), z.string().parse(tag), raw)
  )

  /**
   * The rows the tag form draws under a category, their order, and what each waits for —
   * `tag_form_sections`. One edit per write, in five shapes: a row has an id, so creating,
   * renaming, deleting, reordering and setting a condition are things done to a row rather
   * than five ways of restating a list. `normalizeFormSection` and `resolveTagIds` inside
   * are the parse.
   */
  ipcMain.handle('sections:list', async (): Promise<FormSections> => loadFormSections())

  // One channel for the four things you can do to a section, because they are four shapes
  // of one edit and the union is the schema. Four channels would be four handlers saying
  // "read the client, apply, read back".
  ipcMain.handle('sections:save', async (_event, edit: unknown) => {
    const parsed = sectionEditSchema.safeParse(edit)
    if (!parsed.success) throw new Error('That is not an edit to a section.')
    return saveFormSections(parsed.data)
  })

  /**
   * The named tag sets, the third section of the same file and the same two channels —
   * `normalizeCatalogs` inside is the parse, as it is for both rule sets.
   */
  ipcMain.handle('catalogs:list', async (): Promise<TagCatalogs> => loadCatalogs())

  ipcMain.handle(
    'catalogs:save',
    async (_event, raw: unknown): Promise<TagCatalogs> => saveCatalogs(raw)
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
      DESKTOP_UPLOAD_LIMITS
    )
    // An upload moves `post_count` and moves nothing else — it cannot coin a tag, so no
    // name, category, mark or section in the cached index can have changed. The counts of
    // the tags it applied are patched in place rather than the whole index being thrown
    // away: dropping it meant the next tag field re-read the entire board, once per
    // upload. `bumpTagCounts` has why +1 is exact and needs no query.
    if (result.ok) bumpTagCounts(parseTagInput(parsed.data.tags).tags, 1)
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
    })
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

  ipcMain.handle(
    'tags:create',
    async (_event, name: unknown, category: unknown, section: unknown) => {
      const db = boardDb()
      if (!db) return { ok: false as const, error: 'Not set up yet' }
      const parsedName = tagNameSchema.safeParse(name)
      const parsedCategory = categorySchema.safeParse(category)
      if (!parsedName.success) return { ok: false as const, error: 'Type a tag name.' }
      if (!parsedCategory.success) return { ok: false as const, error: 'Pick a category.' }

      const result = await manageTags.createTag(
        db,
        parsedName.data,
        parsedCategory.data,
        z.number().int().positive().nullable().safeParse(section).data ?? null
      )
      if (result.ok) clearTagCache()
      return result
    }
  )

  ipcMain.handle('tags:rename', async (_event, id: unknown, name: unknown) => {
    const db = boardDb()
    if (!db) return { ok: false as const, error: 'Not set up yet' }
    const parsedId = postIdSchema.safeParse(id)
    const parsedName = tagNameSchema.safeParse(name)
    if (!parsedId.success) return { ok: false as const, error: 'No such tag' }
    if (!parsedName.success) return { ok: false as const, error: 'Type a tag name.' }

    const result = await manageTags.renameTag(db, parsedId.data, parsedName.data)
    if (result.ok) clearTagCache()
    return result
  })

  ipcMain.handle('tags:set-category', async (_event, id: unknown, category: unknown) => {
    const db = boardDb()
    if (!db) return { ok: false as const, error: 'Not set up yet' }
    const parsedId = postIdSchema.safeParse(id)
    const parsedCategory = categorySchema.safeParse(category)
    if (!parsedId.success) return { ok: false as const, error: 'No such tag' }
    if (!parsedCategory.success) return { ok: false as const, error: 'Pick a category.' }

    const result = await manageTags.setTagCategory(db, parsedId.data, parsedCategory.data)
    if (result.ok) clearTagCache()
    return result
  })

  /**
   * Which row of the tag form the tag sits on inside its category. Its own channel rather
   * than a field on `tags:set-category`, because the two move independently — moving a tag
   * to another category is a claim about what it is, and this is only about where the form
   * draws it.
   */
  ipcMain.handle('tags:set-section', async (_event, id: unknown, sectionId: unknown) => {
    const db = boardDb()
    if (!db) return { ok: false as const, error: 'Not set up yet' }
    const parsedId = postIdSchema.safeParse(id)
    // Null is the answer for "on no row", which is what the menu's empty option sends.
    const parsed = z.number().int().positive().nullable().safeParse(sectionId)
    if (!parsedId.success) return { ok: false as const, error: 'No such tag' }
    if (!parsed.success) return { ok: false as const, error: 'No such section' }

    const result = await manageTags.setTagFormSection(db, parsedId.data, parsed.data)
    if (result.ok) clearTagCache()
    return result
  })

  /** What is drawn in front of the tag's name — `tags.mark`. '' clears it. */
  ipcMain.handle('tags:set-mark', async (_event, id: unknown, mark: unknown) => {
    const db = boardDb()
    if (!db) return { ok: false as const, error: 'Not set up yet' }
    const parsedId = postIdSchema.safeParse(id)
    const parsed = markSchema.safeParse(mark)
    if (!parsedId.success) return { ok: false as const, error: 'No such tag' }
    if (!parsed.success) return { ok: false as const, error: 'That is too long for a mark.' }

    const result = await manageTags.setTagMark(db, parsedId.data, parsed.data)
    if (result.ok) clearTagCache()
    return result
  })

  ipcMain.handle('tags:delete', async (_event, id: unknown) => {
    const db = boardDb()
    if (!db) return { ok: false as const, error: 'Not set up yet' }
    const parsedId = postIdSchema.safeParse(id)
    if (!parsedId.success) return { ok: false as const, error: 'No such tag' }

    const result = await manageTags.deleteTag(db, parsedId.data)
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
    const db = boardDb()
    if (!db) return { ok: false as const, error: 'Not set up yet' }
    const parsedTarget = tagNameSchema.safeParse(target)
    const parsedCondition = tagNameSchema.safeParse(condition)
    if (!parsedTarget.success || !parsedCondition.success) {
      return { ok: false as const, error: 'Type a tag name.' }
    }

    const result = await manageTags.applyTagToTagged(
      db,
      parsedTarget.data,
      parsedCondition.data
    )
    if (result.ok) clearTagCache()
    return result
  })

  /**
   * What the upload screen holds, pushed on every change. `on`, not `handle`: nothing is
   * returned and nothing waits for it. Parsed like everything else here, and a message
   * that doesn't fit the shape is dropped rather than left to make the close dialog lie
   * about what would be lost.
   */
  ipcMain.on('upload:state', (_event, state: unknown) => {
    const parsed = stagedStateSchema.safeParse(state)
    if (parsed.success) setStagedState(parsed.data)
  })

  /**
   * `save.json` out to a file, and back in from one. Both open a picker on the main side —
   * the renderer has no filesystem and this is the only way it could name a path.
   *
   * No argument either way: what is exported is the whole file and what is imported is
   * whatever of it this build recognises, so there is nothing for the window to decide.
   * `main/transfer.ts` has why the import is section-by-section rather than a copy.
   */
  ipcMain.handle('settings:export', async () => exportSave())
  ipcMain.handle('settings:import', async () => importSave())

  /** Shows `save.json` in Explorer/Finder — the settings screen's "where is this?". */
  ipcMain.handle('shell:open-data-folder', async (): Promise<void> => revealSaveFile())

  /**
   * Only ever a post on the board. The URL ends up as an argument to a browser or as a
   * string handed to the OS, which would happily run a `file:` or a custom-scheme one, so
   * the scheme is checked rather than assumed.
   */
  ipcMain.handle('shell:open-external', async (_event, url: unknown): Promise<void> => {
    if (typeof url !== 'string') return
    if (!isWebUrl(url)) return
    await openUrl(url, loadPreferences().browser)
  })
}
