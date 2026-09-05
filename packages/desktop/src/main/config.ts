import { existsSync } from 'node:fs'
import { app, shell } from 'electron'
import { clearSection, readSection, savePath } from './save-file'

/**
 * Which board this build talks to. The same three values the web keeps in its
 * environment, plus `siteUrl` for opening a finished post in the browser — read from
 * the repo's environment file at build time and compiled into this bundle by
 * `electron.vite.config.ts`, which refuses to build without all four.
 *
 * They used to be typed into a settings screen on first launch and kept in `save.json`.
 * Two things were wrong with that. The service-role key — which bypasses RLS for the
 * whole project — ended up in a plain file on every machine that ran the app, written
 * by the app itself. And an installer was board-agnostic, so the only way to know what
 * a copy pointed at was to open its settings. A build is now made *for* a board, and
 * the app asks for nothing but a login.
 *
 * The service-role key is what this app writes with, and now the only thing that can:
 * no table in the schema has a write policy, and the buckets take no writes from a
 * session either. The board's accounts are gone — nothing displayed who uploaded what,
 * and this bundle already carried the key, so the login stood in front of a door it was
 * not the lock for. The anon key is still here because reads go through it where a read
 * is all that is wanted.
 */
export type AppConfig = {
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseServiceRoleKey: string
  siteUrl: string
}

/** Replaced at build time by `define`. Nothing else in the app may read it. */
declare const __BUILD_ENV__: AppConfig

/**
 * The same test `isSupabaseConfigured()` makes on the web. The build already refuses
 * placeholders and blanks, so this only catches a bundle built some other way — but a
 * window saying which value is missing beats one that fails inside a Supabase call.
 */
function isUsable(config: AppConfig): boolean {
  return Boolean(
    config.supabaseUrl && config.supabaseAnonKey && config.supabaseServiceRoleKey && config.siteUrl
  )
}

const compiled: AppConfig | null =
  typeof __BUILD_ENV__ === 'object' && __BUILD_ENV__ !== null && isUsable(__BUILD_ENV__)
    ? __BUILD_ENV__
    : null

export function loadConfig(): AppConfig | null {
  return compiled
}

/**
 * The settings screen used to write a `config` section here, service-role key and all.
 * Nothing reads it any more, so it is dropped on the way past rather than left on disk:
 * an unused copy of a key that bypasses RLS is a liability the app itself created, and
 * whoever upgrades never thinks to go looking for it.
 */
export function dropStoredConfig(): void {
  if (readSection('config')) {
    clearSection('config')
    console.info('Removed the stored connection settings — the build supplies them now.')
  }
}

/**
 * The same housekeeping for the login that used to be here. A copy that upgraded from a
 * version with accounts still has a refresh token and, if the box was ticked, the
 * account's password sitting in `save.json` in plain text. Neither is read by anything
 * any more, so both are deleted on the way past rather than left for whoever eventually
 * opens the file.
 */
export function dropStoredLogin(): void {
  const hadSession = readSection('session') !== null
  const hadCredentials = readSection('credentials') !== null
  if (!hadSession && !hadCredentials) return

  clearSection('session')
  clearSection('credentials')
  console.info('Removed the stored login — the app no longer signs in.')
}

/**
 * Shows `save.json` in the OS file manager — the answer to "where did that actually
 * go", which is otherwise a path nobody would guess. It holds the
 * compression preferences now; the keys are in the bundle, not in there.
 *
 * Falls back to the folder when there is no file yet, which is the case until something
 * has been saved once.
 */
export function revealSaveFile(): void {
  const file = savePath()
  if (existsSync(file)) shell.showItemInFolder(file)
  else void shell.openPath(app.getPath('userData'))
}

/**
 * `@common/storage` builds public image URLs from `NEXT_PUBLIC_SUPABASE_URL`, and it is
 * shared verbatim with the web rather than reimplemented. Setting the variable it reads
 * is cheaper than threading a base URL through a module that only ever has one.
 */
export function exportConfigToEnv(config: AppConfig): void {
  process.env.NEXT_PUBLIC_SUPABASE_URL = config.supabaseUrl
}
