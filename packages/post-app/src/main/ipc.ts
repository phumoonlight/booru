import { readFile } from 'node:fs/promises'
import {
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  shell,
  type OpenDialogOptions,
} from 'electron'
import { z } from 'zod'
import { searchTags } from '@web/lib/data/shared'
import { createPostFromImage, parsePostMetadata } from '@web/lib/upload/pipeline'
import { DESKTOP_UPLOAD_LIMITS } from './limits'
import { loadConfig, revealConfig, saveConfig } from './config'
import { stageFiles } from './staging'
import { adminClient, currentUser, resetClients, signIn, signOut, userClient } from './supabase'
import type { AppConfigInput, AppStatus, Outcome, TagSuggestion } from '../shared/api'
import type { UploadResult } from '@web/lib/upload/pipeline'

/**
 * Every channel the window can reach. Each one is small on purpose: the renderer holds
 * no keys and no file access, so anything it needs is a request across here, and a
 * handler that doesn't exist is a capability the window doesn't have.
 *
 * The arguments arrive from a page and are treated that way — parsed, not trusted.
 */

const configSchema = z.object({
  supabaseUrl: z.string(),
  supabaseAnonKey: z.string(),
  supabaseServiceRoleKey: z.string(),
  siteUrl: z.string(),
})

// Same two rules the web's login action applies, so a bad address is refused here
// rather than in a round trip.
const loginSchema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
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
    return {
      configured: config !== null,
      user: config ? await currentUser() : null,
      siteUrl: config?.siteUrl ?? '',
      limits: DESKTOP_UPLOAD_LIMITS,
      encryptedAtRest: safeStorage.isEncryptionAvailable(),
    }
  })

  /**
   * The settings screen reads back what it saved so the fields aren't blank when it is
   * reopened to fix one of them. This is the only way a key ever leaves the main
   * process, and it goes to a window that is about to let you edit it anyway.
   */
  ipcMain.handle('app:read-config', async (): Promise<AppConfigInput | null> => loadConfig())

  ipcMain.handle('app:save-config', async (_event, raw: unknown): Promise<Outcome> => {
    const parsed = configSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: 'Settings were not filled in' }

    const saved = saveConfig(parsed.data)
    if (!saved.ok) return saved
    // New URL or new keys mean the cached clients are pointing at the old project
    resetClients()
    return { ok: true }
  })

  ipcMain.handle('auth:log-in', async (_event, email: unknown, password: unknown) => {
    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message } satisfies Outcome
    }

    return signIn(parsed.data.email, parsed.data.password)
  })

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

  /** Shows `config.json` in Explorer/Finder — the settings screen's "where is this?". */
  ipcMain.handle('shell:open-config-folder', async (): Promise<void> => revealConfig())

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
