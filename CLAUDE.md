@AGENTS.md

# Pubooru

A booru-style image board (Danbooru is the reference): tag-centric gallery, multi-tag
search with negation, post detail pages, uploads by any signed-in user. Fullstack
Next.js 16 App Router + Supabase (Postgres, Storage, Auth), Tailwind v4, mobile-first.

## Replies

Answer like a TL;DR. The work can be thorough; the message about it is short.

- First line is the outcome — what changed, or the answer. No preamble, no "Let me…".
- Then at most 2–4 bullets: what the user has to decide, what broke, what to do next.
  Nothing that only restates the diff or the plan.
- Link files (`[file.ts:42](src/file.ts#L42)`) instead of pasting code back; the user
  can read the diff.
- No closing recap of what the message just said.
- Keep it full-length only for errors, failing output, security notes, and confirmations
  before something destructive — those never get trimmed.
- When a reply genuinely has to run long, it is bullets, not paragraphs. One claim per
  bullet. This includes explanations — answer the question asked, then stop: no
  background the user didn't ask for, no "worth knowing" asides, no survey of where else
  the same pattern appears.

## Commands

| | |
|---|---|
| `npm run dev` / `build` / `lint` | the only verification the repo has — there is no test runner |
| `npm run db:push` / `db:push:dry` | apply migrations to the linked Supabase project |
| `npm run db:list` / `db:reset` | migration status / local reset |
| `npm run post-app:dev` / `post-app:package` | the desktop uploader — window, or a Windows installer |
| `npm run typecheck -w post-app` | the only check the Electron app has; the root `tsc` excludes `packages/` |

Ad-hoc checks (query parser, rating resolution) have been run as throwaway scripts in
the scratchpad, never committed. Keep it that way unless asked for a test setup.

## Git

**Commit on `main`. Do not create a branch unless asked for one.** This is a solo repo
with a linear history; a branch per change just adds a merge step the author then has
to undo. When a branch is genuinely wanted, the author will say so.

Commit only when asked. Never push unless asked.

## Layering — do not cross these lines

- **Reads:** RSC → `src/lib/data/*` → Supabase server client (anon key, RLS enforced).
  Never call Supabase from a page or component directly.
- **Writes:** `'use server'` actions in `src/lib/actions/*` → `requireUser()` first →
  zod parse → `src/lib/data/*`. RLS (`auth.uid() is not null`) is the real guard;
  `requireUser()` exists to fail loudly rather than update zero rows.
- **Pure helpers** (`lib/search.ts`, `lib/tags.ts`, `lib/storage.ts`, `lib/site.ts`)
  import nothing server-side, so client components can share them.
- Query logic stays in `lib/data/` and out of actions/pages so the deferred public API
  can reuse it verbatim (docs/future.md §2).
- **Anything two front ends share takes its clients as arguments.** `lib/data/shared.ts`
  (post write path, `ensureTagIds`, tag-name search), `lib/data/counters.ts` and
  `lib/upload/pipeline.ts` never call `createClient()` — the caller passes
  `(supabase, admin)`. That is what lets `packages/post-app` run them: `supabase/server.ts`
  imports `next/headers` and `admin.ts` is `server-only`, so a module that builds its own
  client can only run inside Next. `lib/data/posts.ts` and `tags.ts` wrap them with the
  request-scoped clients, so no call site in `src/` sees the difference. Don't "simplify"
  a client parameter away.
- Four Supabase clients, each with one job: `server.ts` (cookies, request-scoped),
  `client.ts` (browser), `anon.ts` (cookie-less, for cacheable routes like the sitemap),
  `admin.ts` (service role — never reaches the browser; storage writes/deletes,
  `incrementPostView()` — the one row write an anonymous visitor is allowed to cause —
  and the counter syncs in `lib/data/counters.ts`, whose rows no user session may set).

## The desktop uploader (`packages/post-app`)

The repo is an npm workspace and Electron is the only member. It is the upload page as a
desktop app, and it exists because compression is CPU work a free serverless tier is bad
at — see [packages/post-app/README.md](packages/post-app/README.md).

- **It imports the web's `src/`, it does not copy it** (`@web/*` → `../../src/*`, and
  `@/*` too because the files over there spell each other that way). The pipeline, the
  write path, both compressors and the pure helpers are one definition.
- **Its limits are its own** (`src/main/limits.ts`, 50MB / 100MP). `MAX_FILE_SIZE` and
  `MAX_PIXELS` in `lib/upload-limits.ts` are Vercel's numbers and stay Vercel's.
- Session client writes the post row, service role does storage and the counters — the
  same split as the web, spelled in `createPostFromImage`'s signature.
- The renderer has no keys, no Node and no network: every capability is one
  `ipcMain.handle` in `src/main/ipc.ts`, and the file's bytes are read on the main side.

## Database

- **The schema is six files: storage, then one per table.** `20260826090000_storage_buckets.sql`,
  then `profiles` → `posts` → `tags` → `post_tags` → `rating_counts` in foreign-key
  order. Each table's file holds its columns, indexes **and** RLS policies, so nothing
  about a table is spread across migrations. The eighteen migrations from the build were
  squashed into these before the first deployment. Schema changes from here are
  **always** a new timestamped file, never a dashboard edit and never an edit to the
  squashed six once they have been pushed anywhere real.
- SQL functions holding query logic are gone: search, the post writes, the view counter
  and the two counter triggers all moved into TypeScript, because a plpgsql body needs a
  migration to edit and reports one opaque error, from inside a statement that was about
  something else. What remains in SQL is `handle_new_user()`, which fires on
  `auth.users`, and `EXECUTE` on it is revoked from `anon` and `authenticated` so nothing
  definer-rights is reachable over `/rest/v1/rpc`. Don't add RPCs back without a reason
  PostgREST genuinely can't meet.
- Denormalized counters (`tags.post_count`, `rating_counts.post_count`) are maintained by
  `lib/data/counters.ts`, not by triggers. They **recompute** — PostgREST can't increment,
  and an increment that loses a race is wrong for good — so every write must call
  `syncTagPostCounts` / `syncRatingCounts` with the tags and ratings it moved. They write
  on the service role (`rating_counts` has no write policy at all — the guard is the
  action's `requireUser()`), and they log rather than throw: the post write has already
  landed by then.
- `createPostWithTags()` has no transaction — it deletes the post it just inserted if
  tagging fails, via `deletePostRow()` (which reads the post's tag links before the
  cascade eats them, so the counts come back down). Preserve that unwind if you touch
  the write path.

## Things the code decided that are easy to get wrong

- **`src/proxy.ts`, not `middleware.ts`** — Next 16 renamed the convention. It only
  refreshes the session; it guards no routes. Pages check the session themselves.
- **Search param is `?query=`** (`SEARCH_PARAM` in `lib/search.ts`), space-separated,
  `-tag` excludes. Ratings ride in the same string as `rating:e3` metatags — nothing
  outside `splitRatings`/`resolveRatings` needs to know they exist.
- **Rating scale is `general, e1, e2, e3, e4, e5`.** `RESTRICTED_RATINGS` (e3–e5) means
  "kept out of sitemap.xml and search results" only — nothing is hidden from a visitor.
  Column is free-form text — no check constraint, so a new tier is a code change only.
- **Buckets are `posts` and `post-thumbnails`**, both AVIF-era: thumbnails are lossy AVIF
  (400px tall, width capped at 800 for panoramas, `mitchell` kernel — the grid scales by row height, so height is the bound that matters), the post image is lossless AVIF only when it beats the
  uploaded bytes, otherwise the original byte-for-byte. Paths derive from md5, never stored.
- **MD5 is the dedup key on purpose** — collision resistance is not what it's for.
- **Nothing goes through the Next optimizer.** Both the grid thumb and the detail image
  are `unoptimized`, so the stored file is served untouched (animation intact, no
  re-encode). The grid used to be optimized and it was visibly softening thumbnails:
  Next scales the requested quality by 50/80 for AVIF, so the default 75 became an AVIF
  quality of 47 at effort 3 — a second lossy pass over an already-lossy thumbnail, for
  a resize it could not perform anyway (its optimizer sets `withoutEnlargement`).
- `view_count` is bumped only by the `recordPostView` action from the browser, never on a
  read path — prefetches, `generateMetadata` and crawlers must not inflate it.
- Rating blur is a `data-blur-ratings` attribute on `<html>` set before first paint, so
  the grid stays a plain server render (`lib/rating-blur.ts` + `globals.css`).
- `MAX_FILE_SIZE` lives in `lib/upload-limits.ts` because three layers must agree:
  the drop zone, the upload action, and `serverActions.bodySizeLimit` in `next.config.ts`.
- Pages fall back to `<SetupNotice />` when `isSupabaseConfigured()` is false, so the app
  is browsable before the runbook has been run.

## Style

- Prettier (`.prettierrc`): no semicolons, single quotes, 100 cols, 2 spaces. Run nothing —
  match the surrounding file.
- Comments explain *why*, in prose, and are common in this codebase — the measured
  trade-off, the failure that motivated the choice. Match that register; don't narrate
  what the code already says.
- No component library. Plain Tailwind against the CSS variables in `globals.css`
  (`background`, `surface`, `border`, `muted`, `accent`). Dark theme only.
- Mobile-first: design at 375px, scale up with `sm:`/`md:`/`lg:`. 44px tap targets.
- No role tier exists — any signed-in account can upload, edit and delete. Public signup
  therefore needs a privilege tier first (docs/future.md §1).

## Docs

`docs/PLAN.md` is the entry point (status + working conventions + session log),
`architecture.md`, `database-schema.md`, `phases.md`, `future.md`, and
`supabase-setup.md` (the runbook for everything needing the live project).

**Update `docs/PLAN.md`'s Current status and Session log at the end of a work session** —
that log is where the reasoning behind past decisions lives.

Parts of `architecture.md`, `database-schema.md` and `phases.md` predate later
migrations (they still say `?tags=`, the old `general/sensitive/questionable/explicit`
scale, `originals`/`thumbnails` buckets, WebP thumbs, `requireAdmin()`, shadcn/ui).
When they disagree with `src/` or `supabase/migrations/`, the code wins — and fix the
doc line you tripped over.
