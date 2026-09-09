import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

/**
 * The migration runner, which is what replaced the Supabase CLI.
 *
 * Three commands, keeping the names and the meanings the npm scripts already had:
 *
 *   push    apply every migration this database has not seen, then re-apply the grants
 *   list    what is applied, what is pending
 *   grant   re-apply `db/grants.sql` on its own
 *
 * **There is no `reset`.** It was `drop schema public cascade` behind one word on the
 * command line, which is the whole board — every post row, every tag, the vocabulary — and
 * the images in R2 would survive it as orphans nothing could name. It was worth having
 * while the schema was moving under an empty board; against a board with posts on it, it
 * is a keystroke away from a mistake with no undo. Rebuilding from nothing is rare enough
 * to be worth typing out by hand in a console, where the statement is visible and the
 * database asks which one you are connected to.
 *
 * Every file runs inside a transaction and is recorded in `_migrations`, so a
 * failure rolls back whole and nothing after it runs. That is the one thing `supabase db
 * push` did that had to be kept; everything else it did was about a project this repo no
 * longer has.
 *
 * It connects as `booru_owner` — the only role that may create a table, and the only one
 * that never leaves this machine. `booru_app` and `booru_web` are granted by the
 * baseline's last block and cannot run this.
 */

const here = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = join(here, '..', 'db', 'migrations')
const GRANTS = join(here, '..', 'db', 'grants.sql')

const url = process.env.DATABASE_URL_OWNER
if (!url) {
  // Named rather than a connection error twenty lines down, because "which variable" is
  // the whole question when a runner cannot reach a database.
  console.error('DATABASE_URL_OWNER is not set — see db/README.md.')
  process.exit(1)
}

/** Sorted by name, which is why they are numbered rather than timestamped: the order a
 *  human reads the directory in is the order they run in. */
function migrations() {
  return readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort()
}

async function applied(sql) {
  await sql`
    create table if not exists _migrations (
      name text primary key,
      at timestamptz not null default now()
    )`
  const rows = await sql`select name from _migrations`
  return new Set(rows.map((row) => row.name))
}

async function push(sql) {
  const done = await applied(sql)
  const pending = migrations().filter((name) => !done.has(name))
  if (pending.length === 0) console.log('No new migrations.')

  for (const name of pending) {
    const body = readFileSync(join(MIGRATIONS, name), 'utf8')
    // `begin` gives the file its own transaction. `unsafe` is how a whole file is sent,
    // since the tagged template is for parameterized queries and a migration has none —
    // and `.simple()` is required with it: the extended protocol carries parameters but
    // exactly one statement, so without it a migration runs its first line and silently
    // reports success. The name comes from the directory, never from input.
    await sql.begin(async (tx) => {
      await tx.unsafe(body).simple()
      await tx`insert into _migrations ${tx({ name })}`
    })
    console.log(`applied  ${name}`)
  }

  await grant(sql)
}

/**
 * The grants, every time, whether or not a migration ran.
 *
 * They are desired state rather than history, which is why they are not a migration: a
 * migration runs once, and roles are made *after* a schema exists, or dropped and
 * recreated with new passwords. A grant block that only ever ran inside the baseline was
 * applied exactly once, before either of those could happen — and said nothing about it.
 * Re-applying costs one statement and is idempotent.
 */
async function grant(sql) {
  await sql.unsafe(readFileSync(GRANTS, 'utf8')).simple()
  console.log('granted  db/grants.sql')
}

async function list(sql) {
  const done = await applied(sql)
  for (const name of migrations()) {
    console.log(`${done.has(name) ? 'applied ' : 'pending '} ${name}`)
  }
}

const commands = { push, list, grant }
const command = commands[process.argv[2]]
if (!command) {
  console.error(`Usage: migrate.mjs <${Object.keys(commands).join('|')}>`)
  process.exit(1)
}

// One connection, not a pool: this runs one statement at a time and then exits.
const sql = postgres(url, { max: 1, onnotice: (notice) => console.log(`notice   ${notice.message}`) })
try {
  await command(sql)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await sql.end()
}
