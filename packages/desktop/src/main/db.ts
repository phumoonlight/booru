import postgres from 'postgres'
import type { DbPool } from '@common/db'
import { loadConfig, type AppConfig } from './config'

/**
 * The app's one connection to the board: `booru_app`, from the connection string
 * compiled into this bundle.
 *
 * There used to be a Supabase client here, holding a service-role key, and before that
 * two clients with a login in front of them. The trust model has not changed — possession
 * of the installer is the authorization, and it always effectively was — but what is
 * possessed has, and the difference is worth naming. A service key moves rows over an
 * HTTP API and is revoked with one click. A Postgres connection string is a database
 * account: it is revoked by changing a password, and if it owned the tables it could drop
 * them.
 *
 * So it does not own them. `booru_app` may select, insert, update and delete on every
 * table and may not create, alter or drop anything; the schema belongs to `booru_owner`,
 * which lives in one `.env.local` on one machine and is never deployed or compiled into
 * anything. That keeps a leaked build at "someone can vandalise the data" — unavoidable,
 * the app has to write — rather than at "someone can delete the board".
 *
 * When this app is ever shared with anyone, the compiled-in credential stops being
 * tenable: one string, held by several people, revocable only by breaking it for all of
 * them. The upgrade is small *because* of the role split — a role per person with the
 * same grants, and the string moved out of the bundle and into the settings screen, which
 * held keys before the accounts came out. See db/README.md.
 */

let pool: DbPool | null = null
let builtFor: AppConfig | null = null

/** The board's pool, or null if this bundle was built without a project. */
export function boardDb(): DbPool | null {
  const config = loadConfig()
  if (!config) return null

  // The config is compiled in and cannot change while the window is open, so this is
  // built once. The comparison stays because a pool caches the URL it was made with, and
  // nothing here should quietly outlive the value behind it.
  if (!pool || builtFor !== config) {
    pool = postgres(config.databaseUrl, {
      // A desktop app is one person doing one thing at a time; the upload path is the
      // only place two statements are ever in flight, and even that is a transaction on
      // one connection.
      max: 4,
      // Neon's pooled endpoint hands out a different backend per checkout, so a prepared
      // statement cached against one connection is dead weight at best.
      prepare: false,
      // A window that cannot reach its board should say so rather than hang: this is the
      // difference between "not set up yet" appearing in a second and a spinner that
      // never resolves on a machine with no network.
      connect_timeout: 15,
    })
    builtFor = config
  }

  return pool
}
