import { existsSync } from 'node:fs'
import { app, shell } from 'electron'
import { readSection, savePath, writeSection } from './save-file'

/**
 * What the app needs to reach the board: the same three values the web keeps in its
 * environment, plus `siteUrl`, which is only used to open a finished post in the browser.
 *
 * They come from the settings screen and nowhere else. Reading the repo's `.env.local`
 * during development was convenient in a checkout and a lie everywhere else — the app
 * behaved one way for whoever wrote it and another for whoever installed it, and the
 * screen every real user has to fill in was the one path never exercised.
 *
 * The service-role key is here for the same reason it is in the web's environment: the
 * storage buckets take writes from `authenticated`, but the counter tables
 * (`rating_counts` especially) have no write policy at all by design, so the recount
 * that follows every post write has to run as the service role. The session key does
 * the post row itself, which is how `uploader_id` ends up right.
 */
export type AppConfig = {
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseServiceRoleKey: string
  siteUrl: string
}

let cached: AppConfig | null | undefined

/**
 * The same test `isSupabaseConfigured()` makes on the web: real-looking values, not the
 * placeholders `.env.example` ships. Without it the app would fail deep inside a request
 * with an opaque error instead of showing the setup screen.
 */
function isUsable(config: AppConfig): boolean {
  return Boolean(
    config.supabaseUrl &&
      !config.supabaseUrl.includes('YOUR_PROJECT_REF') &&
      config.supabaseAnonKey &&
      !config.supabaseAnonKey.startsWith('YOUR_') &&
      config.supabaseServiceRoleKey &&
      !config.supabaseServiceRoleKey.startsWith('YOUR_')
  )
}

export function loadConfig(): AppConfig | null {
  if (cached !== undefined) return cached

  const stored = readSection<AppConfig>('config')
  cached = stored && isUsable(stored) ? stored : null
  return cached
}

export function saveConfig(config: AppConfig): { ok: true } | { ok: false; error: string } {
  const trimmed: AppConfig = {
    supabaseUrl: config.supabaseUrl.trim().replace(/\/+$/, ''),
    supabaseAnonKey: config.supabaseAnonKey.trim(),
    supabaseServiceRoleKey: config.supabaseServiceRoleKey.trim(),
    siteUrl: config.siteUrl.trim().replace(/\/+$/, ''),
  }
  if (!isUsable(trimmed)) {
    return { ok: false, error: 'Fill in the project URL, the anon key and the service role key' }
  }
  if (!/^https?:\/\//.test(trimmed.supabaseUrl)) {
    return { ok: false, error: 'The project URL must start with https://' }
  }

  writeSection('config', trimmed)
  cached = trimmed
  return { ok: true }
}

/**
 * Shows `save.json` in the OS file manager — the answer to "where did that actually
 * go", which is otherwise a path nobody would guess. It is selected rather than opened,
 * so the choice of what reads a file full of keys stays with whoever asked.
 *
 * Falls back to the folder when there is no file yet, which is the case until the
 * settings screen has been filled in once.
 */
export function revealConfig(): void {
  const file = savePath()
  if (existsSync(file)) shell.showItemInFolder(file)
  else void shell.openPath(app.getPath('userData'))
}

/**
 * `lib/storage.ts` builds public image URLs from `NEXT_PUBLIC_SUPABASE_URL`, and it is
 * shared verbatim with the web rather than reimplemented. Setting the variable it reads
 * is cheaper than threading a base URL through a module that only ever has one.
 */
export function exportConfigToEnv(config: AppConfig): void {
  process.env.NEXT_PUBLIC_SUPABASE_URL = config.supabaseUrl
}
