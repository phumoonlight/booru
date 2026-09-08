import type postgres from 'postgres'

/**
 * The database handle every function in `@common/data/*` takes, and not one of them
 * builds — the same bargain `BooruClient` made, one layer further down.
 *
 * It replaced a Supabase client, and with it PostgREST. What that cost is every embed,
 * every `maybeSingle()` and the thousand-row ceiling a request answered with; what it
 * bought is that a query is a query — the searches that used to resolve tag membership
 * in TypeScript because PostgREST could not express an intersection are one statement
 * now, and the post write is a real transaction rather than a hand-written unwind.
 *
 * **`ISql`, not `Sql`.** postgres.js hands a transaction callback a `TransactionSql`,
 * which extends the query interface but not the pool's — so a function typed against
 * `Sql` cannot be called inside `begin()`. Typing the whole data layer against the
 * narrower one is what lets `createPostWithTags` run its four statements in a
 * transaction while every other caller passes the pool and notices nothing.
 */
export type Db = postgres.ISql

/**
 * The pool itself — what a host builds once and holds. Only two files in the repo name
 * this type: the website's `src/lib/db.ts` and the desktop's `main/db.ts`. Everything
 * shared takes `Db`, so `packages/common` still builds no client and still reads no
 * environment (invariants 3 and 4).
 */
export type DbPool = postgres.Sql

/**
 * The first row, or null — what `maybeSingle()` used to say.
 *
 * postgres.js answers every query with an array, which is the honest shape and the
 * wrong one at a dozen call sites that asked about one row by its primary key. This is
 * the only place that asymmetry is spelled.
 */
export function first<T>(rows: readonly T[]): T | null {
  return rows[0] ?? null
}

/**
 * Postgres' `unique_violation`. Three writes have to explain it in their own words
 * rather than hand back a database message — a tag name already taken, a section
 * already on the category — and every other error from those statements is genuinely
 * unexpected.
 *
 * It used to be the string `'23505'` compared against `error.code` in two files. The
 * driver types its errors as `unknown` at a catch site, so the narrowing lives here
 * once instead of being written out at each `catch`.
 */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}
