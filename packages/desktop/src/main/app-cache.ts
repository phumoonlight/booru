import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

/**
 * One folder — `app-cache` inside the app's data folder — for everything the app holds
 * only because reading it again is slow, and nothing else.
 *
 * The tag index started out as a file beside `save.json`. Two kinds of file in one folder
 * is one question too many: `save.json` is settings, meant to be opened, hand-edited and
 * carried to another machine, and losing it loses something. Everything in here is a copy
 * of what the board already holds, so the whole folder can be deleted at any moment and
 * the only cost is the next read. Keeping them apart means that sentence stays true
 * without anyone having to check which file is which.
 *
 * The JSON files in here are `{ at, … }` — when it was read, then whatever it holds — and
 * a day old is the point at which one stops being trusted. What "stops being trusted"
 * means is the caller's, not this file's: the tag index serves a stale copy rather than
 * nothing when the board cannot be reached. `thumbs/` is the exception with no clock on it
 * at all, and `main/thumb-cache.ts` says why.
 *
 * This file knows the folder, the day and the JSON; what any one cache holds is its own.
 */

const FOLDER = 'app-cache'

/** A day. Long enough to cover a session, short enough that something somebody else
 *  changed shows up without anyone having to know these files exist. */
export const CACHE_TTL = 24 * 60 * 60 * 1000

/** Exported so the settings screen can say where all of this is, and so `thumbs/` can
 *  sit under the same roof without this file knowing what an image is. */
export function cacheDir(): string {
  return join(app.getPath('userData'), FOLDER)
}

function cachePath(file: string): string {
  return join(cacheDir(), file)
}

/** Whether a `{ at }` stamp is still inside the day. */
export function isFresh(at: number): boolean {
  return Date.now() - at < CACHE_TTL
}

/**
 * A cache file's contents as a plain object, or `null` if it is missing or won't parse —
 * both of which mean the same thing here. Callers check the shape of what they asked for:
 * this file knows the folder and the format, not what any one cache holds.
 */
export function readCache(file: string): Record<string, unknown> | null {
  const path = cachePath(file)
  if (!existsSync(path)) return null

  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    // A cache that won't parse is a cache that isn't there. Nothing in this folder is
    // worth a crash, and the fix is one read from the board.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

export function writeCache(file: string, value: unknown): void {
  try {
    mkdirSync(cacheDir(), { recursive: true })
    // Not indented: nobody edits these by hand, and the whitespace would be most of it
    writeFileSync(cachePath(file), JSON.stringify(value), 'utf8')
  } catch (error) {
    // A cache that cannot be written still works for this run, which is most of its value
    console.error(`Could not write ${file}:`, error instanceof Error ? error.message : error)
  }
}

export function dropCache(file: string): void {
  try {
    rmSync(cachePath(file), { force: true })
  } catch {
    // Nothing to do about it, and the in-memory copy is gone either way
  }
}
