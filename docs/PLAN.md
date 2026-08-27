# Booru — Implementation Plan (Master Document)

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
  Schema still includes `status` and `uploader_id` columns so opening this up later
  is a policy change, not a migration.
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
| 0 | Project scaffold (Next.js + Tailwind + Supabase client) | 🟡 in progress |
| 1 | Database schema + migrations + admin auth | 🟡 in progress |
| 2 | Upload pipeline (admin): file → dedup → thumbnail → tags | 🟡 in progress |
| 3 | Browse: post grid, post detail page, pagination | 🟡 in progress |
| 4 | Tag search: multi-tag query, autocomplete, tag drawer | 🟡 in progress |
| 5 | Polish: rating filter, SEO, error pages, deploy | 🟡 in progress |

Status legend: 🔲 not started · 🟡 in progress · ✅ done

## Current status

**Phases 0–5 code-complete.** 6 migrations written (schema, functions/triggers, RLS,
storage, post RPCs, `search_posts`). Upload pipeline: page-wide drop zone on the posts
page (file → MD5 dedup → sharp WebP thumb → storage → `create_post_with_tags` RPC with
rollback, untagged), Manage section on `/posts/[id]` for edit + delete. Public site: home grid backed by the multi-tag
search RPC, sticky search bar with debounced autocomplete and `-tag` exclusion, tag
sidebar/bottom-drawer facets, `/posts/[id]` detail, `/tags` index.
Phase 5 polish: `rating:x` / `-rating:x` metatags ride in the same `?tags=` string and
resolve to the search RPC's existing `p_rating` argument, backing a clickable rating
facet in the sidebar/drawer. No rating is hidden from any visitor; the adult tiers are
only kept out of `sitemap.xml` and search-engine results.
SEO is `metadataBase` + title template + OG/Twitter defaults in the root layout, real
per-post metadata with the thumbnail as OG image, `robots.ts` and `sitemap.ts`.
Error pages: root 404, post 404, `error.tsx` and `global-error.tsx`.

Build + lint clean; every route returns 200 in dev (`/nope` 404s); the query parser and
rating resolution have 34 passing assertions.

Every phase stays 🟡 until [supabase-setup.md](./supabase-setup.md) has been run end to
end against the real project. Phase 5's remaining work is entirely in that runbook:
step 10 verifies the rating filter against real data, step 11 deploys to Vercel with a
custom domain, step 12 is Supabase production hardening, step 13 is the backup story.

Note: Next 16 renamed the `middleware.ts` convention to `proxy.ts` — session refresh
lives in `src/proxy.ts`. There are no admin-only routes: admin affordances are sections
of public pages, and `requireAdmin()` plus the RPCs' `is_admin()` are the real gate.

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
