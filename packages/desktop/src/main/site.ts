import { readSiteState, setSiteState, type SiteState } from '@common/data/site'
import { boardDb } from './db'

/**
 * The website's maintenance switch, read and written from here.
 *
 * It is on this side of the bridge for the reason everything else is: the renderer holds
 * no connection. What makes it worth a module rather than two lines in `ipc.ts` is the
 * unreachable case — a copy of the app that cannot see the board must not draw a switch
 * that looks off, because "off" is the state that means the site is serving. `null` is
 * what the settings screen shows as "couldn't read", and it is a different thing from a
 * board that answered "not in maintenance".
 *
 * There is no cache here at all. The switch is asked for once, when the settings screen
 * opens, and the website's own ten-minute hold is the only place holding an answer
 * matters — see `src/lib/data/site.ts`. A copy kept here would be a second thing to
 * invalidate every time this app moved the switch itself.
 */

/** What the board says, or `null` if it could not be asked. */
export async function loadSiteState(): Promise<SiteState | null> {
  const db = boardDb()
  if (!db) return null

  try {
    return await readSiteState(db)
  } catch (error) {
    console.error('Could not read site_settings:', error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Move the switch, answering with the row as stored — so the screen shows what the board
 * now says rather than what was asked for.
 *
 * The failure is reported rather than swallowed: this is the one write in the app whose
 * effect is invisible from the window that made it, and a switch that silently did
 * nothing would be found out by a visitor.
 */
export async function saveSiteState(input: {
  maintenance: boolean
  message: string
}): Promise<{ ok: true; state: SiteState } | { ok: false; error: string }> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'This build has no board to write to.' }

  try {
    return { ok: true, state: await setSiteState(db, input) }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not reach the board.',
    }
  }
}
