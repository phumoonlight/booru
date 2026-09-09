import type { Db } from '@common/db'

/**
 * `site_settings` — what the website is doing, as opposed to what is on it. Read by the
 * site on a visit, written by the desktop app's settings screen, which is the only half of
 * this project that writes anything.
 *
 * The table is **a name and a string**, so a new setting is an insert rather than a
 * migration, and a row is something the person who owns the board can read and change by
 * hand in a console. What that moves here is the meaning: every value below is defined as
 * a pair — a reader that copes with whatever the row actually holds, and a default it
 * falls back to. A value written by an older build, typed by hand, or simply absent
 * therefore costs a default and never a throw, which is the only way a settings table is
 * allowed to fail on a page that has to render.
 *
 * A setting with two parts is two rows (the switch and its notice), not one row of JSON:
 * structure nothing here needs would cost the property the table exists for.
 *
 * Both halves of the project compile this file, so the handle is an argument (invariant 3)
 * and nothing here reads an environment or decides how long an answer may be held — that
 * is the website's, in `src/lib/data/site.ts`.
 */

/** The rows this file knows how to read. A new setting is a key here and a reader below. */
export const SITE_SETTINGS = {
  maintenance: 'maintenance',
  maintenanceMessage: 'maintenance_message',
} as const

/** The maintenance switch, its notice, and when either was last decided. */
export type SiteState = {
  maintenance: boolean
  message: string
  /** Epoch milliseconds, so it crosses the IPC bridge and an RSC boundary unchanged. */
  updatedAt: number
}

/** What a board with no such rows — or unreadable ones — is taken to be saying. */
export const SITE_UP: SiteState = { maintenance: false, message: '', updatedAt: 0 }

/**
 * **Reading is loose, writing is strict** — the bargain `asRating` makes for ratings, and
 * for the same reason: this value is meant to be typed into a console by hand, so the
 * spellings a person would reach for all work, while everything the app itself writes has
 * one spelling.
 *
 * Only an affirmative closes the site. A missing row, an empty string, a typo, a value
 * from a build that spelled this differently — all leave it serving, because the failure
 * that matters here is a board that shuts itself over a row it misread.
 */
const CLOSED = ['on', 'true', 'yes', '1', 'maintenance']

export function isMaintenanceValue(value: string): boolean {
  return CLOSED.includes(value.trim().toLowerCase())
}

/** What the app writes, and the only spelling it ever writes. */
export function maintenanceValue(on: boolean): string {
  return on ? 'on' : 'off'
}

/**
 * Read a set of settings by name — `{ key: { value, updatedAt } }`, missing keys simply
 * absent. The generic half: every reader below is this plus a default.
 */
async function readSettings(
  db: Db,
  keys: string[]
): Promise<Record<string, { value: string; updatedAt: number }>> {
  const rows = await db<{ key: string; value: string; updated_at: Date }[]>`
    select key, value, updated_at
      from site_settings
     where key = any(${keys})`

  const found: Record<string, { value: string; updatedAt: number }> = {}
  for (const row of rows) {
    found[row.key] = { value: row.value, updatedAt: row.updated_at.getTime() }
  }
  return found
}

/**
 * Write settings, stamping the moment they were decided.
 *
 * One statement for the whole set, so the two halves of a maintenance state can never
 * land apart — the notice is only read while the switch is on, and two calls would let the
 * site show yesterday's sentence for the moment between them. An upsert, because the point
 * of a key/value table is that a setting can be written before anything has seeded it, and
 * `updated_at` is set here rather than by a default: it means "when someone last decided
 * this", so re-wording a notice moves it.
 */
async function writeSettings(db: Db, entries: { key: string; value: string }[]): Promise<number> {
  const now = new Date()
  const rows = entries.map(({ key, value }) => ({ key, value, updated_at: now }))

  await db`
    insert into site_settings ${db(rows, 'key', 'value', 'updated_at')}
    on conflict (key) do update
       set value = excluded.value,
           updated_at = excluded.updated_at`

  return now.getTime()
}

/** Is the site closed, what does the notice say, and when was that decided. */
export async function readSiteState(db: Db): Promise<SiteState> {
  const found = await readSettings(db, [
    SITE_SETTINGS.maintenance,
    SITE_SETTINGS.maintenanceMessage,
  ])

  const switchRow = found[SITE_SETTINGS.maintenance]
  const messageRow = found[SITE_SETTINGS.maintenanceMessage]
  if (!switchRow && !messageRow) return SITE_UP

  return {
    maintenance: switchRow ? isMaintenanceValue(switchRow.value) : false,
    message: messageRow ? messageRow.value.slice(0, 500) : '',
    // The later of the two rows: they are written together by this app, and separately by
    // whoever edits one of them by hand — in which case the edit is the news.
    updatedAt: Math.max(switchRow?.updatedAt ?? 0, messageRow?.updatedAt ?? 0),
  }
}

/**
 * Move the switch and word the notice in one write, answering with the state as stored so
 * the screen that flipped it never has to guess.
 */
export async function setSiteState(
  db: Db,
  input: { maintenance: boolean; message: string }
): Promise<SiteState> {
  const message = input.message.trim().slice(0, 500)
  const updatedAt = await writeSettings(db, [
    { key: SITE_SETTINGS.maintenance, value: maintenanceValue(input.maintenance) },
    { key: SITE_SETTINGS.maintenanceMessage, value: message },
  ])

  return { maintenance: input.maintenance, message, updatedAt }
}
