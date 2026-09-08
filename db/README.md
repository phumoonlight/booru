# The database

Postgres on Neon. `migrations/` is the source of truth, applied by `scripts/migrate.mjs`
— there is no Supabase CLI any more and no dashboard edit is ever the answer.

| | |
|---|---|
| `npm run db:push` | apply every migration the database has not seen, then re-apply `grants.sql` |
| `npm run db:list` | what is applied and what is pending |
| `npm run db:reset` | drop `public`, re-apply everything. Leaves an empty board |

`grants.sql` is not a migration and runs on every push, because who may do what is
desired state rather than history — roles get made after the schema, or remade with new
passwords, and a grant block buried in the baseline would have run once, before any of
that.

All three read `DATABASE_URL_OWNER` from `.env.local`.

## The three roles

**The owner is the one Neon already made** — `neondb_owner`, which owns the `neondb`
database. That is `DATABASE_URL_OWNER`; don't create another.

The other two are yours, because their passwords do not belong in git. **Make them with
SQL, in Neon's SQL Editor — not with the console's Add role button:**

```sql
create role booru_app login password 'a long random string';
create role booru_web login password 'a different long random string';
```

A console-made role is granted `neon_superuser` and comes with CREATEDB, CREATEROLE and
BYPASSRLS, which overrides every grant below — `booru_web` reads as select-only and can
write anything. The owner role cannot revoke that membership either (`permission denied
to revoke role "neon_superuser"`), so the only repair is `drop role` and make it again
from SQL. That is the whole reason this section exists.

Then `npm run db:push` — it re-applies `grants.sql` whether or not a migration ran, so it
is also what you run after recreating a role.

**Roles belong to a branch.** Neon's Roles panel says so, and it matters only if you ever
branch for testing: roles made after the branch point exist on one side of it.

| role | held by | may |
|---|---|---|
| `neondb_owner` | the environment file, the migration runner only | everything, DDL included |
| `booru_app` | compiled into the desktop bundle | read and write every row; **no** create, alter or drop |
| `booru_web` | Vercel | read every row; `update (view_count) on posts`, and nothing else |

The reasoning is in `migrations/0001_baseline.sql`. The short version: a Postgres login
extracted from a desktop bundle is an account rather than a revocable key, so the thing
that keeps a leaked build from dropping a table is that its role owns nothing.

## Adding a migration

A new numbered file — `0002_whatever.sql` — never an edit to one already applied
anywhere real. Each runs inside a transaction and is recorded in `_migrations`;
a file that fails rolls back whole and nothing after it runs.

There are no SQL functions and no triggers, deliberately. Search, the post writes, the
view counter and the counters are all TypeScript in `@common/data/*`: a plpgsql body
needs a migration to edit and reports one opaque error from inside a statement that was
about something else.
