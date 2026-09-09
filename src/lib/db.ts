import 'server-only'
import postgres from 'postgres'
import type { DbPool } from '@common/db'
import { databaseUrl } from '@/config'

/**
 * The website's one connection to the board, and the whole of what it may do.
 *
 * There were two clients here — `anon.ts` for every read and `admin.ts`, marked
 * `server-only` and carrying a **service-role key**, for the view counter. That split
 * existed because the only way to write one column through PostgREST was a key that
 * bypassed every policy in the project, so counting a view meant deploying a credential
 * that could have dropped the schema.
 *
 * What replaces it is a Postgres role. `booru_web` may select from every table and
 * `update (view_count) on posts` — a column grant, checked by the database — and that is
 * all it may do. So one handle is enough, and the boundary is stronger than the one it
 * replaced rather than merely tidier.
 *
 * `server-only` stays. It is no longer guarding a key that could do anything, but a
 * connection string in a client bundle is still a connection string in a client bundle,
 * and this module is the one place the URL is used — `src/config.ts` is where it, and
 * every other environment value, is read.
 */

/**
 * One pool per server instance, not per request. Next re-imports modules across
 * lambdas but not within one, so a module-level pool is exactly as long-lived as the
 * instance that holds it — which is what Neon's pooled endpoint expects on the other
 * end.
 *
 * Built lazily so `isDatabaseConfigured()` can be false and the setup notice can render
 * rather than the import itself throwing.
 */
let pool: DbPool | null = null

export function db(): DbPool {
  if (!pool) {
    pool = postgres(databaseUrl()!, {
      // A serverless instance holds few connections and holds them briefly; the pooled
      // endpoint is on the other side of this, doing the real multiplexing.
      max: 5,
      // Prepared statements are per-connection, and a pooler hands out a different
      // backend each time — so they are cached for a connection that may not be the one
      // that gets the next query. postgres.js names them per-connection and copes, but
      // the cache is dead weight against a pooler either way.
      prepare: false,
    })
  }
  return pool
}

/**
 * True once `.env.local` holds a real connection string. Pages use this to show the
 * setup notice instead of failing opaquely, which is what makes the app browsable
 * before the environment file has been filled in.
 */
export function isDatabaseConfigured(): boolean {
  const url = databaseUrl()
  return Boolean(url && !url.includes('YOUR_'))
}
