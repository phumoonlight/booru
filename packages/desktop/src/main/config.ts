import { existsSync } from 'node:fs'
import { app, shell } from 'electron'
import { imageUrl } from '@common/storage'
import { clearSection, readSection, savePath } from './save-file'

/**
 * Which board this build talks to — the database, the bucket, and the site a finished
 * post is opened on. Read from the repo's environment file at build time and compiled
 * into this bundle by `electron.vite.config.ts`, which refuses to build without every
 * one of them.
 *
 * They used to be typed into a settings screen on first launch and kept in `save.json`.
 * Two things were wrong with that. The credential that can write the whole board ended
 * up in a plain file on every machine that ran the app, written by the app itself. And
 * an installer was board-agnostic, so the only way to know what a copy pointed at was to
 * open its settings. A build is now made *for* a board, and the app asks for nothing.
 *
 * There is no read-only credential here beside the writing one. There was — an anon key
 * next to a service-role key — but the board has no anon role any more and the reads and
 * the writes go down the same connection, so a second one would be a key held for the
 * sake of symmetry.
 */
export type AppConfig = {
  /** `booru_app` — reads and writes every row, owns nothing. See `main/db.ts`. */
  databaseUrl: string
  /** The bucket's public origin, for building an image URL. No credential in it. */
  cdnUrl: string
  /** Where a finished post can be opened. */
  siteUrl: string
  /** Writing to the bucket — `main/r2.ts`, and the only secret here besides the database. */
  r2: {
    accountId: string
    accessKeyId: string
    secretAccessKey: string
    bucket: string
  }
}

/** Replaced at build time by `define`. Nothing else in the app may read it. */
declare const __BUILD_ENV__: AppConfig

/**
 * The same test `isDatabaseConfigured()` makes on the web. The build already refuses
 * placeholders and blanks, so this only catches a bundle built some other way — but a
 * window saying it is not set up beats one that fails inside a connection attempt.
 */
function isUsable(config: AppConfig): boolean {
  return Boolean(
    config.databaseUrl &&
      config.cdnUrl &&
      config.siteUrl &&
      config.r2?.accountId &&
      config.r2?.accessKeyId &&
      config.r2?.secretAccessKey &&
      config.r2?.bucket
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
 * an unused copy of a credential that can write the whole board is a liability the app
 * itself created, and whoever upgrades never thinks to go looking for it.
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
 * And the same again for the tag rules, which are the board's now rather than this
 * machine's. A copy that upgraded from a version that kept them here has two sections
 * nothing reads; leaving them would invite hand-editing a file the app has stopped
 * looking at. The rules on the board are not touched — this only clears the local copy,
 * which is why it says how many rules it is dropping rather than doing it silently.
 */
export function dropStoredRules(): void {
  const implications = readSection<Record<string, unknown>>('implications')
  const recommendations = readSection<Record<string, unknown>>('recommendations')
  if (!implications && !recommendations) return

  const kept = Object.keys(implications ?? {}).length + Object.keys(recommendations ?? {}).length
  clearSection('implications')
  clearSection('recommendations')
  console.info(`Removed ${kept} locally stored tag rules — they live on the board now.`)
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
 * The public URL of a stored image, built from this bundle's own base.
 *
 * There was an `exportConfigToEnv` here that set `NEXT_PUBLIC_SUPABASE_URL` on the
 * process at startup, because `@common/storage` read it to build the same URL. That was
 * a shared module reaching for one host's environment (invariant 4) and a desktop app
 * pretending to be Next to satisfy it. The base is an argument now, and this is where
 * this host supplies it.
 */
export function boardImageUrl(path: string): string {
  const config = loadConfig()
  return config ? imageUrl(config.cdnUrl, path) : ''
}
