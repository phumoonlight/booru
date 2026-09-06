import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

/**
 * One file — `save.json` in the app's data folder — holding everything the app
 * remembers between launches, as JSON anyone can open and read.
 *
 * It was three files sealed with Electron's `safeStorage` (DPAPI / Keychain /
 * libsecret). That is gone by choice: a sealed file cannot be inspected, hand-edited or
 * copied to another machine, and a key that the OS can no longer produce takes the
 * settings with it. There is now nothing secret in here at all — the service-role key
 * lives in the bundle, and the session token and remembered password went with the
 * login. It is still written 0600, which costs nothing.
 *
 * Two sections: the compression preferences and `catalogs`, the named sets of tags that
 * are applied when asked for by name. They share a file so there is one thing to look at,
 * back up or delete, and the catalogs are the section most worth opening the file for,
 * being a list you may well want to paste a hundred entries into at once.
 *
 * `session`, `credentials`, `config`, `implications` and `recommendations` are names this
 * type still knows, and only so what an older version wrote under them can be deleted —
 * see `dropStoredConfig()`, `dropStoredLogin()` and `dropStoredRules()`. The two rule
 * sets moved onto the board's `tag_rules` table, where a rule can follow the tag it names
 * instead of going quietly dead when that tag is renamed.
 */

const SAVE_FILE = 'save.json'

export type Section =
  | 'preferences'
  | 'session'
  | 'credentials'
  | 'implications'
  | 'recommendations'
  | 'catalogs'
  | 'config'

/** Where the save file lives. Exported so the settings screen can point at it. */
export function savePath(): string {
  return join(app.getPath('userData'), SAVE_FILE)
}

function readAll(): Record<string, unknown> {
  const file = savePath()
  if (!existsSync(file)) return {}

  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    // Hand-editable means hand-breakable: anything that isn't an object is treated as
    // absent, which costs a re-setup and never a crash.
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch (error) {
    console.error('Could not read save.json:', error instanceof Error ? error.message : error)
    return {}
  }
}

function writeAll(document: Record<string, unknown>): void {
  const file = savePath()
  mkdirSync(dirname(file), { recursive: true })
  // Indented because the point of dropping the encryption was being able to read it
  writeFileSync(file, JSON.stringify(document, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
}

export function readSection<T>(section: Section): T | null {
  const value = readAll()[section]
  return value && typeof value === 'object' ? (value as T) : null
}

/**
 * Read-modify-write, because the other two sections live in the same file and none of
 * these writes knows what the others are holding.
 */
export function writeSection(section: Section, value: unknown): void {
  writeAll({ ...readAll(), [section]: value })
}

/** Drops one section; the last one out takes the file with it. */
export function clearSection(section: Section): void {
  const rest = { ...readAll() }
  delete rest[section]
  if (Object.keys(rest).length === 0) rmSync(savePath(), { force: true })
  else writeAll(rest)
}
