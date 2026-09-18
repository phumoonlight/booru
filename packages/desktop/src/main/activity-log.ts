import { BrowserWindow } from 'electron'
import { dropCache, readCache, writeCache } from './app-cache'
import type { LogEntry } from '../shared/api'

/**
 * What this copy of the app did to the board, in `app-cache/logs.json` — an upload, an edit,
 * a delete, with how long it took and what the board or the bucket said when it refused.
 *
 * It sits in the cache folder rather than beside `save.json` because losing it loses nothing
 * the board does not hold: it is a readout of this machine's recent writes, for working out
 * afterwards what happened to an image, not a record anything depends on.
 *
 * Every entry is pushed to the window as it is written (`activity:entry`), which is how the
 * Logs screen stays live and how a failure becomes a notice without each screen having to
 * remember to raise one.
 */

const FILE = 'logs.json'

/** Newest kept, oldest dropped. The whole file is rewritten per entry, so it stays small
 *  enough that doing so costs nothing worth measuring. */
const MAX_ENTRIES = 1000

let entries: LogEntry[] | null = null
let nextId = 1

function load(): LogEntry[] {
  if (entries) return entries
  const stored = readCache(FILE)?.entries
  entries = Array.isArray(stored) ? (stored as LogEntry[]) : []
  nextId = entries.reduce((top, entry) => Math.max(top, entry.id), 0) + 1
  return entries
}

export function readLog(): LogEntry[] {
  return load()
}

export function clearLog(): void {
  entries = []
  dropCache(FILE)
}

export function logActivity(entry: Omit<LogEntry, 'id' | 'at'>): void {
  const list = load()
  const full: LogEntry = { id: nextId++, at: new Date().toISOString(), ...entry }
  list.unshift(full)
  if (list.length > MAX_ENTRIES) list.length = MAX_ENTRIES
  writeCache(FILE, { at: Date.now(), entries: list })
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('activity:entry', full)
  }
}

type Result = { ok: boolean; error?: string }

/**
 * Runs one write and logs its answer — `ok` as info, a refusal or a throw as an error, with
 * the time it took. The write's own answer is handed back untouched, and a throw is rethrown:
 * logging is beside the write, never a change to what it says.
 *
 * `describe` adds what only the answer knows (the new post's id, how many moved).
 */
export async function logged<T extends Result>(
  action: string,
  detail: Record<string, unknown>,
  write: Promise<T>,
  describe?: (result: Extract<T, { ok: true }>) => Record<string, unknown>
): Promise<T> {
  const started = performance.now()
  const ms = () => Math.round(performance.now() - started)
  try {
    const result = await write
    logActivity({
      level: result.ok ? 'info' : 'error',
      action,
      message: result.ok ? 'ok' : (result.error ?? 'Refused'),
      detail: {
        ...detail,
        ...(result.ok ? describe?.(result as Extract<T, { ok: true }>) : undefined),
        ms: ms(),
      },
    })
    return result
  } catch (error) {
    logActivity({
      level: 'error',
      action,
      message: error instanceof Error ? error.message : String(error),
      detail: { ...detail, ms: ms() },
    })
    throw error
  }
}
