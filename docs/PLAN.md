# Pubooru — Implementation Plan (Master Document)

> **Purpose:** This is the entry point for every work session. Read this file first,
> then jump to the phase you're working on in [phases.md](./phases.md).
> Update the **Current Status** and **Session Log** sections at the end of every session.

## What we're building

A booru-style image board (reference: Danbooru — see [design/interface-example.png](./design/interface-example.png)):
tag-centric image gallery with multi-tag search, post detail pages, and admin-managed uploads.

## Hard requirements (user's conditions)

1. **Fullstack Next.js** — one project, App Router, Server Actions for all mutations.
2. **Supabase** — Postgres (database), Storage (images), Auth (login).
3. **Mobile-first** — the mobile experience is the priority; desktop adapts from it.
   Danbooru's desktop layout (fixed left sidebar) becomes a slide-in drawer / bottom
   sheet on mobile.

## Deferred by design (do NOT build these yet)

Documented in [future.md](./future.md) so current decisions don't block them later:

- **Community moderation** — for now only the admin (site owner) uploads/moderates.
  Schema still records `uploader_id`, so opening this up later is mostly a policy
  change; the moderation `status` column was dropped and would come back with it.
- **Public API** — for now all data access goes through Server Actions / RSC.
  Keep data-access logic in `src/lib/data/` (not inline in actions) so route
  handlers can reuse it when the public API arrives.
- **Public accounts** — no public signup and no per-user features (favorites).
  Auth exists only so the admin can log in; accounts are created from the Supabase
  dashboard. `profiles` + `profiles.role` already exist, so opening signup later is
  a settings change plus a `favorites` migration, not a rework.

## Document map

| File | Contents |
|---|---|
| [PLAN.md](./PLAN.md) | This file — status, conventions, session log |
| [architecture.md](./architecture.md) | Tech stack, folder structure, key patterns |
| [database-schema.md](./database-schema.md) | Full Postgres schema, RLS, indexes, search function |
| [phases.md](./phases.md) | Phase-by-phase checklists (the actual to-do list) |
| [supabase-setup.md](./supabase-setup.md) | **Runbook** — every step needing the real Supabase project; run once implementation is done |
| [future.md](./future.md) | Deferred features + how the current design accommodates them |

## Phase overview

| # | Phase | Status |
|---|---|---|
| 0 | Project scaffold (Next.js + Tailwind + Supabase client) | ✅ done |
| 1 | Database schema + migrations + admin auth | ✅ done |
| 2 | Upload pipeline (admin): file → dedup → thumbnail → tags | ✅ done |
| 3 | Browse: post grid, post detail page, pagination | ✅ done |
| 4 | Tag search: multi-tag query, autocomplete, tag drawer | ✅ done |
| 5 | Polish: rating filter, SEO, error pages, deploy | ✅ done |

Status legend: 🔲 not started · 🟡 in progress · ✅ done

## Current status

**Phases 0–5 code-complete.** The schema is six migrations — storage, then one per table
in foreign-key order (`profiles`, `posts`, `tags`, `post_tags`, `rating_counts`), each
carrying its own indexes and RLS. The 18 written during the build were squashed into
them, because most of them only undid each other (see the session log). Upload pipeline:
page-wide drop zone on the posts page (file → MD5 dedup → AVIF thumbnail and
lossless-AVIF post candidate in `lib/imgcmp/` → storage → `createPostWithTags()` with
rollback, untagged), Manage section on `/posts/[id]` for edit + delete. Public site: `/` is a minimal front
door (wordmark, search box, post count in keycap emoji), `/posts` is the grid backed by
`searchPosts()`, sticky search bar with debounced autocomplete and `-tag` exclusion, tag
sidebar/bottom-drawer facets, `/posts/[id]` detail, `/tags` index.
Phase 5 polish: `rating:x` / `-rating:x` metatags ride in the same `?query=` string and
resolve in `lib/search.ts` before the query is built, backing a clickable rating
facet in the sidebar/drawer. No rating is hidden from any visitor; the adult tiers are
only kept out of `sitemap.xml` and search-engine results.
SEO is `metadataBase` + title template + OG/Twitter defaults in the root layout, real
per-post metadata with the thumbnail as OG image, `robots.ts` and `sitemap.ts`.
Error pages: root 404, post 404, `error.tsx` and `global-error.tsx`.

Build + lint clean; every route returns 200 in dev (`/nope` 404s); the query parser and
rating resolution have 34 passing assertions.

**All six phases are ✅.** The runbook has been run through step 10 against the real
project (`jxlyofznvmfsbljqttbx`): browsing, multi-tag search and the rating filter were
all checked against real posts on 2026-08-29 — grid at 375px, `tag_a tag_b -tag_c`,
thumb-friendly autocomplete, `rating:` / `-rating:` narrowing the grid. Steps 11–13
(Vercel deploy, Supabase production hardening, backups) are **dropped**: this is a hobby
project running on the author's own machine, and the two things in them that are not
about a public origin — bucket size/MIME caps, and the images themselves — are already
covered by the upload action's limits and by the originals living outside the bucket.
The recipes stay in the runbook if that ever changes.

**A second front end: `packages/post-app`**, an Electron uploader. The repo is now an
npm workspace (`packages/*`); the desktop app is the only member. It exists because the
upload path is mostly image compression, which is the one thing a free serverless tier is
worst at — so the same pipeline runs on the author's own machine, where a file may be
50MB and 100MP instead of Vercel's 4MB and 20MP, and writes to the same Supabase project.

It is not a copy. `src/lib/upload/pipeline.ts` (validate → compress → store → insert →
unwind) and `src/lib/data/shared.ts` (the post write path, `ensureTagIds`, the tag-name
search) take their Supabase clients as arguments rather than building them, so both the
web's server actions and the desktop app's IPC handlers run the same functions. See
[packages/post-app/README.md](../packages/post-app/README.md).

Each tag also has its own page, `/tags/[id]` — the gallery grid for one tag, without the
search bar or the tag drawer, and with the rating blur switched off. The `/tags` index
links there rather than to `?query=`. `/tags/manage` is the full tag editor: create,
rename, recategorize, delete.

There is no open work item left in the plan. What's next comes from
[future.md](./future.md) or from using the thing.

The `public` schema holds one SQL function, `handle_new_user()`, and it fires on
`auth.users` — a table the app never writes. Search, the post writes, the view counter
and both denormalized counters all live in `src/lib/data/`, and the Supabase linter's
`SECURITY DEFINER` findings are answered rather than dismissed.

Note: Next 16 renamed the `middleware.ts` convention to `proxy.ts` — session refresh
lives in `src/proxy.ts`; it guards no routes, pages check the session themselves. There
are no admin-only routes and no role tier at all: upload, edit and delete are sections of
public pages, and RLS's `auth.uid() is not null` plus each action's `requireUser()` are
the real gate.

## Working conventions (for every session)

- Work through phases in order; within a phase, check off items in phases.md as you go.
- Anything requiring the real Supabase project (dashboard clicks, `db push`, live
  verification) goes in [supabase-setup.md](./supabase-setup.md), not here and not in
  phases.md — those steps are batched for one session after the code is written.
- Database changes are **always** SQL migration files in `supabase/migrations/`
  (timestamped), never ad-hoc dashboard edits — the schema must be reproducible.
- Mutations = Server Actions. Reads = React Server Components calling `src/lib/data/`.
- Every UI is built mobile-first (design at ~375px width, then scale up with
  `sm:`/`md:`/`lg:` breakpoints).
- Before ending a session: update **Current status**, the phase table above, and
  append a **Session log** entry.

## Session log

_Newest first. Format: date — what was done, what's next, any decisions made._

- **2026-08-30 (3)** — `/tags/manage` can now create and rename tags, not only
  recategorize and delete them. Creating covers the order an upload can't: naming an
  artist or a series first, with its category already right, before any post carries it —
  it starts on no posts, so no counter moves. Renaming updates the row in place, which is
  the whole reason it is safe: the id never changes, so every `post_tags` link and every
  `/tags/[id]` URL survives and nothing is recounted; only searches spelling the old name
  stop matching, and the panel says so. A name that is already taken is refused rather
  than merged — folding two tags means moving links and recounting both, and doing that
  behind a rename would be a destructive edit dressed as a cosmetic one. Both actions read
  Postgres' 23505 explicitly so a collision reads as "already exists" instead of a raw
  database message, and both name fields type an underscore when the space bar is pressed,
  since a space is what would otherwise start a second tag. These two are the file's only
  actions called through `startTransition` rather than `useActionState`: success has to
  clear the field and close the panel, which a state-only hook can't do without the
  setState-in-effect the React Compiler forbids.

- **2026-08-30 (2)** — Gave each tag its own page at `/tags/[id]`: the gallery layout with
  neither the search bar nor the tag drawer, because both exist to narrow across many tags
  and this page has already picked one. It is keyed by id rather than name so renaming a
  tag can't break a link, and `/tags` now points its cells here instead of at
  `/posts?query=…`; the way back to the controls is a "View in posts" link that spells
  the same query. Posts still come from `searchPosts({ query: tag.name })` — one listing
  implementation, so paging and rating handling can't drift. `SearchHeader` gained a
  `showSearch` prop (default true) so the nav stays in one place. The rating blur is off
  here: a new `[data-no-blur]` subtree rule in `globals.css`, three attributes deep so it
  outweighs the per-rating rules on specificity rather than on source order. Unlike page 1
  of an arbitrary search, one tag's first page is a stable bounded listing, so it is
  indexable; deeper pages are not.

- **2026-08-30** — Split the gallery off the front page, the way the old boorus have
  theirs: `/` is now a landing page (wordmark, the same `<SearchBar />`, nav, and the post
  count spelled in keycap emoji via `lib/emoji-number.ts`), and the listing moved verbatim
  to `/posts` along with its `loading.tsx` — which stops the post-grid skeleton from
  flashing on `/tags`, `/upload` and `/account`, since it had been sitting at the
  `(public)` group root. Only `searchHref()` knew the listing's path, so every tag link,
  rating facet, chip and pagination link followed the move for free; `/?query=…` redirects
  to `/posts?query=…` so old links and anything a crawler holds still work. The count is
  `getPostCount()` — a head-only exact count on `posts`, not the sum of `rating_counts`,
  because that table is derived data a failed sync can leave behind. Post writes now
  revalidate `/posts` *and* `/`, since the front door quotes a number that every upload and
  delete changes.

- **2026-08-29 (9)** — Built `packages/post-app`, an Electron uploader, and refactored
  the web's upload path so the two share it rather than diverge. The repo gained
  `"workspaces": ["packages/*"]`; the root `tsconfig.json` excludes `packages/`, which
  has its own.

  The refactor is the interesting half. Three things stood between the pipeline and a
  second front end, and all three were the same thing: a module that built its own
  Supabase client could only run inside Next, because `supabase/server.ts` imports
  `next/headers` and `admin.ts` is `server-only`. So the write path moved to
  `lib/data/shared.ts` and now takes `(supabase, admin, …)` — the session client for the
  post row, the service role for the counters, which makes the old `security definer`
  split visible in the signature instead of implied. `lib/data/counters.ts` took the
  same treatment. `lib/data/posts.ts` and `lib/data/tags.ts` kept every signature their
  callers already used, as thin wrappers that supply the request-scoped clients, so
  nothing in `src/` changed. `getPostByMd5` became `findPostIdByMd5` — dedup only ever
  asked for the id.

  Then `lib/actions/upload.ts` lost everything that was not about a web request:
  `createPostFromImage` and `parsePostMetadata` are `lib/upload/pipeline.ts` now, and
  the action is `requireUser()` → parse → call → `revalidatePath`. `MAX_PIXELS` moved to
  `lib/upload-limits.ts` beside `MAX_FILE_SIZE`, because both numbers are Vercel's — the
  4.5MB request body and the 10s function timeout — and neither belongs to the pipeline.
  The desktop app passes its own (50MB / 100MP, `packages/post-app/src/main/limits.ts`).
  `CATEGORY_COLOR` and `CATEGORY_LABEL` moved from `components/tag-list.tsx` to
  `lib/tags.ts` so a tag chip looks the same in a window with no Next in it.

  Decisions in the app itself: it signs in as a real user (session persisted, encrypted
  with the OS keystore via Electron `safeStorage`) **and** carries the service-role key,
  exactly the split the web has — the post row is written on the session so
  `uploader_id` is right, and storage plus `rating_counts` on the service role because
  no user session may set those. The renderer holds neither key: every capability it has
  is one `ipcMain.handle`, and the file it uploads is read on the other side of the
  bridge rather than shipped across it. Staging goes through the main process too, which
  means a bad file is refused with a reason before it becomes a row — the web can only
  measure bytes from the browser.

- **2026-08-29 (8)** — Squashed the 18 migrations into six before the first real
  deployment: `20260826090000_storage_buckets.sql`, then one file per table in
  foreign-key order — `profiles` (with `handle_new_user()`), `posts`, `tags`,
  `post_tags`, `rating_counts`. Reason: twelve of the eighteen existed only to undo the
  other six. A reader of `supabase/migrations/` met `is_admin()`, a Google-OAuth email
  allow-list, `posts.status`/`score`, four counter triggers and four RPCs before finding
  out that none of them are in the schema, and replaying all that is the slowest and
  most fragile way to arrive at five tables.

  Decision: **one file per table**, each carrying that table's columns, indexes *and*
  RLS policies. The build's migrations were grouped by kind — all the tables, then all
  the triggers, then all the policies — which meant answering "what is `post_tags`?"
  took three files. The failure modes are per-table too, so the file you open on a
  policy problem is the one that defines the table. Storage is its own file and runs
  first: `storage.*` is extension-owned with its own rules (its tables refuse direct
  deletes, so a bad bucket is cleaned up from the dashboard, never from a migration),
  and nothing in it depends on the app's tables — the policies test `bucket_id` and
  `auth.uid()` only.

  Decision: the files keep early timestamps rather than new ones, so a fresh `db push`
  sees only unapplied migrations; the cost is that a project already carrying the old
  series cannot be pushed to and has to be reset (`db:reset`, or `db:reset:remote` for
  the linked project — which is why that script exists). Decision: the surviving *why*
  comments were carried across (free-form `rating`, the recompute-not-increment
  counters, the `revoke execute` on `handle_new_user`, md5 as the dedup key), the
  archaeology of removed features was not — that is what this log is for. Migration ids
  that no longer resolve were taken out of `CLAUDE.md`, `docs/`, and the comments in
  `lib/data/posts.ts` / `counters.ts`.

  The first `db:reset:remote` failed, and not because of the squash: VS Code's
  format-on-save ran a SQL formatter over the migration and rewrote `$$` as `$ $`, which
  ends `handle_new_user()`'s dollar-quoted body mid-declaration (`syntax error at or
  near "$"`). `.vscode/settings.json` now sets `"[sql]": { "editor.formatOnSave":
  false }`, and `20260826100000_profiles.sql` says why at the top — migrations are
  hand-written and read top to bottom, so no formatter should touch them. Two warnings
  in that output are harmless and unrelated: no `supabase/seed.sql` exists (there is
  nothing to seed), and the migration-catalog cache needs Docker, which this machine
  does not have.

  Also considered and rejected: moving the bucket `insert` to `seed.sql`. Seeds run on
  `db reset` only, never on `db push`, so a project provisioned by push would get the
  four `storage.objects` policies with neither bucket existing. Buckets are structure
  here, not sample data. Note: `supabase-setup.md` step 4 still tells you to promote a
  `profiles.role` that was dropped long before this; it was already stale and is
  untouched.

- **2026-08-29 (7)** — Phase 5 closed, and with it the plan. The rating filter was
  verified against real posts (runbook step 10), so its last verify box is ticked.
  Decision: steps 11–13 are **dropped**, not deferred — the site is a hobby project on
  the author's machine, so a Vercel deploy with a custom domain, the auth/session
  hardening that protects a public origin, and a backup schedule are all guarding
  something that does not exist. Two parts of them were worth a second look before
  dropping: bucket size/MIME caps (step 12), which the upload action already enforces on
  every path into storage, and backups (step 13), where the loss is the tags rather than
  the images — the originals live outside the bucket. Both accepted. The steps stay
  written down in the runbook, marked dropped rather than deleted, so a later decision to
  publish has the recipe. Next: nothing in the plan — [future.md](./future.md) or use.

- **2026-08-29 (6)** — Phases 0–4 marked ✅. The author had already run the runbook
  through step 9 and verified browsing and tag search against real posts: the grid reads
  well at 375px, `tag_a tag_b -tag_c` returns the right set from the database, and the
  autocomplete is usable one-handed. The two `[ ]` verify items in phases.md (steps 6
  and 8) are ticked and the phase table's first five rows flipped. Only Phase 5 is still
  🟡, and only for runbook steps 10–13: rating filter against real data, Vercel deploy,
  production hardening, backups. Note for whoever ticks the rest: phases.md's *checked*
  items still describe the pre-refactor world — `?tags=`, WebP thumbs,
  `originals`/`thumbnails`, `requireAdmin()`, and the `search_posts` /
  `create_post_with_tags` RPCs that the 202608291* migrations deleted. The boxes are
  right, the prose behind them is stale.

- **2026-08-29 (5)** — Moved the two image encoders out of `actions/upload.ts` into
  `src/lib/imgcmp/`: `compressImgForThumbnail()` (resize + lossy AVIF) and
  `compressImgForPost()` (the lossless-AVIF candidate), both returning the same
  `{ ok, message, buffer, error }` shape rather than throwing. Reason: the action's job
  is validation, dedup, storage and the row write, and the encoder settings sitting
  inline meant every tuning change touched the middle of that flow. The rationale for
  each setting travels with it now — mitchell over lanczos3, the height-not-longest-side
  bound, why animated inputs are skipped. Decision: the size comparison that decides
  whether the AVIF candidate is actually stored, and the debug logging around it, stay
  in the action. They are about the uploaded bytes, not about the encoder, and the whole
  point of the branch is that the winner depends on the input — a function that decided
  for itself would hide the thing worth watching. The PNG re-deflate branch stayed put
  for the same reason: it is a fallback keyed on AVIF having lost, not a third encoder.
  No behaviour change; build and lint clean. Next: the runbook still gates every phase.

- **2026-08-29 (4)** — Retired the last two counter triggers to TypeScript:
  `20260829130000_drop_counter_triggers.sql` drops `tag_post_count_update()` and
  `rating_count_update()` with their four triggers, and `src/lib/data/counters.ts` takes
  over as `syncTagPostCounts()` / `syncRatingCounts()`. Same reason as the two migrations
  before it — a plpgsql body needs a migration to edit, and a failed count aborted the
  insert that fired it, so a bookkeeping problem surfaced as "your upload failed".
  Decision: the counters **recompute** rather than increment. PostgREST cannot express
  `post_count = post_count + 1` at all, and the CAS that rescued `increment_post_view`
  is the wrong shape here — a dropped view is acceptable, a dropped tag count is drift
  that never heals. Counting the rows that define the number is exact, and a sync that
  fails is repaired by the next write touching the same tag or rating, so the syncs log
  and never throw (the post write has already succeeded by then; failing it afterwards
  would trade a wrong number for a lost image). Supporting changes: `setPostTags()` now
  diffs the wanted tags against the links already stored and returns the ones that
  moved, so a retag that only reorders the box recounts nothing; `deletePostRow()` is
  shared by the delete action and the create unwind, reading the post's tag links before
  the cascade takes them; the migration adds `posts_rating_idx` so a rating recount is
  index-only rather than the sequential scan `rating_counts` was built to avoid. Second
  decision, after a first pass got it wrong: the syncs run on the **service-role**
  client, not the caller's session, so `rating_counts` keeps the select-only RLS it has
  always had. Giving `authenticated` a write policy there would have handed every
  signed-in session a PostgREST endpoint for setting the facet counts to anything, to
  buy a guard the action's `requireUser()` already provides — the triggers were
  `security definer` for exactly this reason. Consequence to watch: an upload now pays one `count(*)` per tag it
  touches, run in parallel — a post with dozens of tags is the case to measure first.

- **2026-08-29 (later)** — Emptied the `public` schema of callable SQL functions, after
  the Supabase linter flagged every `SECURITY DEFINER` function as `anon`-executable over
  `/rest/v1/rpc`. Two migrations: `20260829110000_revoke_trigger_function_execute.sql`
  revokes `EXECUTE` on `handle_new_user`, `tag_post_count_update` and
  `rating_count_update` from `public, anon, authenticated` — a trigger's `EXECUTE` is
  checked once at `CREATE TRIGGER`, never when it fires, so the triggers are untouched;
  and `20260829120000_drop_increment_post_view.sql` retires the view counter to
  `incrementPostView()` in `lib/data/posts.ts`. Decision reversed from earlier today: the
  atomicity that kept `increment_post_view` in SQL is recoverable from TypeScript as a
  compare-and-swap — read `view_count`, write back with `.eq('view_count', <what was
  read>)`, and a losing writer matches no row and reads again (three attempts, then the
  view is dropped). It runs on the service-role client, which widens `admin.ts` past
  "storage only" for the first time; that is the trade for not having a definer function
  anon can call. Consequence to watch: the CAS costs two round trips per view and gets
  slower exactly where a post is popular — the `post_views` dedup table in future.md §4
  is where that stops being a retry loop and becomes one upsert.

- **2026-08-29** — Moved the query logic out of the SQL functions. `search_posts`,
  `create_post_with_tags` and `update_post_with_tags` are gone (migration
  `20260829100000_drop_post_query_rpcs.sql`); their work is now `searchPosts()` in
  `lib/data/search.ts` and `createPostWithTags()` / `updatePostWithTags()` in
  `lib/data/posts.ts`, both plain PostgREST calls on the caller's session. Reason: a
  plpgsql body needs a migration to edit and a deploy to try, and reports a failure as
  one opaque message; as separate requests each step is visible, loggable and
  re-runnable, and a search change is a code edit. Search resolves the multi-tag AND to
  id lists in TypeScript (reading `post_tags` in 1000-row pages so nothing truncates
  silently) and lets one request filter, order and count — plain browsing with no tags
  skips that entirely. Decisions: `increment_post_view` stays in SQL — it is an atomic
  in-place increment anonymous visitors must be able to run, which PostgREST can't
  express without a read-modify-write race. And the write path gives up its
  transaction, so `createPostWithTags()` deletes the post it just inserted if tagging
  fails (the cascade unwinds `post_tags` and the count triggers). Consequence to watch:
  the tag-membership id lists ride in the request URL, so a tag with a very large
  `post_count` is the thing that will hurt first — that is when a materialized tag
  array or a function comes back.

- **2026-08-28** — Uploads no longer get the `tagme` placeholder: `INITIAL_TAG` is gone
  and `create_post_with_tags` is called with an empty array, so a fresh post has no
  tags. The Manage form's tags box lost its `required` attribute and `updatePost`'s
  "at least one tag" check, so clearing the box now clears the post's tags (the RPC
  already deletes every row not named in `p_tags`). `GroupedTagList` already rendered
  "No tags on this post." for the empty case.

- **2026-08-28** — Dropped `profiles.role`: any signed-in user can upload and manage
  posts. Migration `20260828110000_drop_role_any_user_manages.sql` rewrites every
  `is_admin()` policy (posts, tags, post_tags, storage) to `auth.uid() is not null`,
  moves the same test into the create/update RPCs, then drops the helper and the column.
  `requireAdmin()` → `requireUser()`; the upload link, `canUpload` and `canManage` key
  off `profile !== null`. Also removed rating gating entirely: the facet lists every
  tier for everyone, `resolveRatings()` lost its `allowRestricted` argument, and
  `components/explicit-gate.tsx` is gone. Decision: `RESTRICTED_RATINGS` survives, but
  now means "keep out of `sitemap.xml` and search-engine results" only — nothing on the
  site is hidden from a visitor. Consequence to watch: with no role tier, any account
  that can sign in can delete posts, so public signup needs a privilege tier first
  (future.md §1).

- **2026-08-27** — Phase 5 code: rating filter as `rating:x` metatags parsed out of the
  existing query string (`splitRatings` + `resolveRatings` in `lib/search.ts`) and fed
  to `search_posts`'s `p_rating`; clickable `RatingList` facet; `ExplicitGate` blur on
  direct links to explicit posts. SEO: root-layout `metadataBase`/title template/OG
  defaults, per-post `generateMetadata` with the thumbnail as OG image, query-aware home
  metadata, `robots.ts`, `sitemap.ts`. `not-found.tsx` (root + post), `error.tsx`,
  `global-error.tsx`, blur placeholders, and React `cache` on the reads that
  `generateMetadata` duplicates. Decisions: ratings travel in `?tags=` rather than a
  separate param, so chips, tag links and the search bar needed no special cases and no
  migration was required — `search_posts` already took `p_rating`. Hiding explicit is a
  default, not a ceiling: naming `rating:explicit` opts in, since the site has no
  accounts to hang a preference on yet. Deploy, Supabase hardening and backups are
  dashboard work, so they became steps 11–13 of the runbook rather than code.
  Next: run [supabase-setup.md](./supabase-setup.md) end to end.
- **2026-08-26 (8)** — Dropped public accounts from the plan: the old Phase 5
  (public signup + favorites) moved to [future.md](./future.md) §3, and the old
  Phase 6 (polish) is now Phase 5. Rationale: auth exists only for the admin login,
  so signup and per-user features are a separate product decision. The `favorites`
  table is no longer part of the schema to build — it is documented in future.md with
  its RLS shape so adding it later is one migration.
- **2026-08-26 (7)** — Phase 4 code: `search_posts` RPC (AND over includes via
  group/having, NOT EXISTS over excludes, `count(*) over()` for pagination),
  `lib/search.ts` pure query parsing/URL helpers, `lib/data/search.ts`
  (`searchPosts`, `searchTags`, `getTagsForPosts`), sticky `SearchHeader` +
  client `SearchBar` (chips, debounced autocomplete via a server action, arrow-key
  and touch selection), `TagDrawer` (bottom sheet under `lg`, sidebar above),
  reworked `TagList`/`GroupedTagList` with include/exclude affordances, `/tags` page.
  Home now always goes through the RPC — `getPosts` deleted. Decisions: autocomplete
  is a server action, not a route handler, since the public API is deferred;
  `SearchBar` is keyed on the query so navigation resets it instead of a sync effect
  (React Compiler forbids setState-in-effect). The RPC SQL is the one piece never run
  against a real Postgres — [supabase-setup.md](./supabase-setup.md) step 8 checks it
  explicitly. Next: Phase 5 (accounts & favorites).
- **2026-08-26 (6)** — Phase 3 code: `lib/data/tags.ts` + expanded `lib/data/posts.ts`
  (paged `getPosts`, `getPostTags`, `getPostNeighbours`), home grid at
  `app/(public)/page.tsx` (2→4→6 cols, `next/image` sizes, pagination, single-tag
  filter via `?tags=`), `/posts/[id]` detail (fit-to-width image linking the original,
  Danbooru-coloured tags by category, metadata, prev/next), loading skeletons, empty
  states, `next.config.ts` remote image patterns derived from the Supabase env var,
  bottom nav wired to real routes. Pages fall back to a setup notice when Supabase
  env vars are absent, so the app is browsable pre-runbook. Decision: single-tag
  filtering only until the Phase 4 `search_posts` RPC replaces it.
  Next: Phase 4 (tag search).
- **2026-08-26 (5)** — Extracted every Supabase-project setup/verification step out of
  PLAN.md and phases.md into [supabase-setup.md](./supabase-setup.md) (7 steps: create
  project → env → link/push → admin user → auth verify → upload verify → mark phases
  done, plus troubleshooting). Decision: implement all code first, run the runbook once
  at the end.
- **2026-08-26 (4)** — Phase 2 code: `create_post_with_tags` + `update_post_with_tags`
  RPCs (admin-checked, security definer), upload action (zod → MD5 dedup → sharp
  thumbnail → storage via service role → RPC on user session, storage rollback on
  failure), `/admin/upload` with preview + duplicate link, `/admin/posts` list with
  delete/edit. Tag parsing in `lib/tags.ts`, storage URL helpers in `lib/storage.ts`.
  Build/lint pass. Verification blocked on Supabase project (runbook above).
  Next: run runbook, or code Phase 3 (browse) which is also DB-blocked for verify only.
- **2026-08-26 (3)** — Phase 1 code: 4 migrations (tables, functions/triggers, RLS,
  storage buckets), `/login` + logout (server actions, zod), `/admin` guard in proxy +
  admin layout re-check + `requireAdmin()` for future admin actions, `lib/data/profiles.ts`.
  Build/lint pass. Blocked on Supabase project for: db push, admin user, RLS verification
  (runbook in Current status). Next: user creates project → run runbook → Phase 2.
- **2026-08-26 (2)** — Phase 0 scaffold: create-next-app (Next 16.3.3, TS, Tailwind v4,
  App Router, src/), installed `@supabase/supabase-js @supabase/ssr sharp zod server-only`
  + `supabase` CLI (dev dep), `supabase init`, client factories in `src/lib/supabase/`,
  session refresh in `src/proxy.ts` (Next 16 convention, not `middleware.ts`), dark
  mobile-first layout with placeholder bottom nav, home page with Supabase health badge.
  Build/lint/dev verified. Next: user creates Supabase project + fills `.env.local`,
  then Phase 1.
- **2026-08-26** — Wrote the implementation plan (this document set). Next: Phase 0 scaffold.
