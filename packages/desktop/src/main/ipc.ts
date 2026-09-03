import { readFile } from 'node:fs/promises'
import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'
import { z } from 'zod'
import { listTags, searchTags } from '@web/lib/data/shared'
import { createPostFromImage, parsePostMetadata } from '@web/lib/upload/pipeline'
import { DESKTOP_UPLOAD_LIMITS } from './limits'
import { CPU_COUNT, DEFAULT_ENCODE_PRIORITY, DEFAULT_ENCODE_THREADS } from './cpu'
import { loadConfig, revealSaveFile } from './config'
import { loadPreferences, savePreferences } from './preferences'
import { readCredentials, saveCredentials } from './credentials'
import { previewFile, stageFiles } from './staging'
import { downloadImages } from './download'
import { setQueueState } from './queue-guard'
import { adminClient, currentUser, signIn, signOut, userClient } from './supabase'
import type { AppStatus, Outcome, PreferencesInput, SavedLogin, TagSuggestion } from '../shared/api'
import type { Tag } from '@web/lib/tags'
import type { UploadResult } from '@web/lib/upload/pipeline'

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

// Same two rules the web's login action applies, so a bad address is refused here
// rather than in a round trip.
const loginSchema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

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

/** What the web's /tags page reads, and for the same reason: an index nobody scrolls
 *  past is not worth the round trip, and the tags past it have a post or two each. */
const TAG_INDEX_LIMIT = 500

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
      user: config ? await currentUser() : null,
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

  ipcMain.handle(
    'auth:log-in',
    async (_event, email: unknown, password: unknown, remember: unknown) => {
      const parsed = loginSchema.safeParse({ email, password })
      if (!parsed.success) {
        return { ok: false, error: parsed.error.issues[0].message } satisfies Outcome
      }

      const result = await signIn(parsed.data.email, parsed.data.password)
      // Only a login that worked is worth keeping, and only the box says to keep it.
      // Everything else clears the file, so unticking it is how you forget.
      if (result.ok) saveCredentials(remember === true ? parsed.data : null)
      return result
    }
  )

  /**
   * Hands the stored password to the form that is about to submit it anyway. Log out
   * deliberately leaves it alone — the point of the box is that the next login is
   * already typed out.
   */
  ipcMain.handle('auth:saved-login', async (): Promise<SavedLogin | null> => readCredentials())

  ipcMain.handle('auth:log-out', async (): Promise<void> => signOut())

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
    const supabase = userClient()
    if (!supabase) return []
    if (!(await currentUser())) return []
    return listTags(supabase, TAG_INDEX_LIMIT)
  })

  /** Autocomplete for the tag field, on the same query the web's `suggestTags` action runs. */
  ipcMain.handle('tags:suggest', async (_event, query: unknown): Promise<TagSuggestion[]> => {
    const parsed = z.string().max(64).safeParse(query)
    const supabase = userClient()
    if (!parsed.success || !supabase) return []
    if (!(await currentUser())) return []

    const tags = await searchTags(supabase, parsed.data)
    return tags.map(({ name, category, post_count }) => ({ name, category, post_count }))
  })

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

    const supabase = userClient()
    const admin = adminClient()
    if (!supabase || !admin) return { ok: false, error: 'Not set up yet' }

    // The desktop equivalent of requireUser(): RLS is the real guard, this fails loudly
    // rather than letting an insert quietly match no policy.
    const uploader = await currentUser()
    if (!uploader) return { ok: false, error: 'Sign in first' }

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

    return createPostFromImage(
      supabase,
      admin,
      uploader.id,
      bytes,
      metadata.metadata,
      DESKTOP_UPLOAD_LIMITS
    )
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
