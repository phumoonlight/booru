import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { app, shell } from 'electron'
import { readStore, storePath, writeStore } from './secure-store'

/**
 * What the app needs to reach the board. Three of the four are the same variables the
 * web reads out of `.env.local`; `siteUrl` is only used to open a finished post in the
 * browser.
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

const CONFIG_FILE = 'config.store'

let cached: AppConfig | null | undefined

/**
 * A `.env`-shaped file, parsed just far enough. No dotenv dependency: this reads three
 * known keys out of the repo's own `.env.local` during development so the app runs
 * against the same project as `npm run dev` without being set up twice.
 */
function readEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {}
  const values: Record<string, string> = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return values
}

/**
 * Development falls back to the web app's environment, so a checkout that already runs
 * `npm run dev` runs this too. A packaged app has no repo beside it — `app.isPackaged`
 * is the switch, and there the settings screen is the only way in.
 */
function fromDevEnv(): AppConfig | null {
  if (app.isPackaged) return null

  const env = { ...readEnvFile(findRepoEnv()), ...process.env }

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!isUsable({ supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey, siteUrl: '' })) return null

  return {
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
    siteUrl: env.NEXT_PUBLIC_SITE_URL ?? '',
  }
}

/**
 * The website's `.env.local`, found by walking up from wherever Electron thinks the app
 * is. `electron-vite dev` puts that two levels below the repo root, but running the
 * built `out/main/index.js` by hand does not, and a search costs four `existsSync` calls.
 */
function findRepoEnv(): string {
  let dir = app.getAppPath()
  for (let up = 0; up < 5; up++) {
    const candidate = join(dir, '.env.local')
    if (existsSync(candidate)) return candidate
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return ''
}

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

  const stored = readStore<AppConfig>(CONFIG_FILE)
  cached = stored && isUsable(stored) ? stored : fromDevEnv()
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

  writeStore(CONFIG_FILE, trimmed)
  cached = trimmed
  return { ok: true }
}

/**
 * Shows the stored settings in the OS file manager — the answer to "where did that
 * actually go", which is otherwise a path nobody would guess. The file itself is
 * ciphertext, so revealing it gives nothing away; it is selected rather than opened
 * because opening it would only show that.
 *
 * Falls back to the folder when there is no file yet, which is the case in a checkout
 * running off the repo's `.env.local`.
 */
export function revealConfig(): void {
  const file = storePath(CONFIG_FILE)
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
