# Implementation Phases — Checklists

Work top to bottom. Check items off (`[x]`) as they're completed and mirror phase
status in [PLAN.md](./PLAN.md). Each phase ends with something verifiable.

**Setup steps live elsewhere.** Anything needing the real Supabase project — creating
it, `db push`, the admin account, dashboard checks — is collected in
[supabase-setup.md](./supabase-setup.md) and run in one pass after the code is written.
Phases below list only work done in the repo; each phase's "Done when" is confirmed
during that runbook.

---

## Phase 0 — Project scaffold

**Goal:** running Next.js app connected to Supabase, deployable.

- [x] `npx create-next-app@latest` (TypeScript, App Router, Tailwind, `src/` dir, ESLint) — Next.js 16.3.3
- [x] Install deps: `@supabase/supabase-js`, `@supabase/ssr`, `sharp`, `zod` (+ `server-only`, `supabase` CLI as dev dep)
- [x] Supabase CLI init (`supabase init`) so `supabase/migrations/` exists
- [x] `.env.example` template for the three Supabase keys
- [x] Client factories in `src/lib/supabase/`: `server.ts` (cookies), `client.ts` (browser), `admin.ts` (service role, server-only)
- [x] Session refresh in `src/proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`)
- [x] Base layout: dark theme, mobile viewport meta, placeholder nav
- [x] Home page renders a live Supabase connection-status badge
- [x] Verify: `npm run build`, `npm run lint`, and `npm run dev` all pass

**Done when:** `npm run dev` shows a styled empty shell that successfully talks to
Supabase — the badge turning green is confirmed in
[supabase-setup.md](./supabase-setup.md) steps 1–2.

---

## Phase 1 — Schema + admin auth

**Goal:** full schema migrated; the admin can log in; admin mutations are role-checked.

- [x] Migration 1: tables `profiles`, `posts`, `tags`, `post_tags` (+ indexes)
- [x] Migration 2: `handle_new_user` trigger, `tag_post_count` trigger, `is_admin()` helper
- [x] Migration 3: enable RLS + all policies
- [x] Migration 4: storage buckets `originals`, `thumbnails` + storage policies
- [x] `/login` page (email/password) + logout action (`src/app/(auth)/login/`, `src/lib/actions/auth.ts`)
- [x] `requireAdmin()` helper (`src/lib/auth.ts`) at the top of every admin server action, backed by the RPCs' own `is_admin()` test — there is no admin-only route to guard (Phase 5 removed `/admin`)
- [x] Verify: build + lint pass

**Done when:** schema is live via migrations only, and admin login works on mobile —
creating the admin user and checking the session are
[supabase-setup.md](./supabase-setup.md) steps 3–5.

---

## Phase 2 — Upload pipeline (admin)

**Goal:** admin uploads an image with tags from a phone; post + thumbnail + tags appear in DB/storage.

- [x] Migration: `create_post_with_tags` RPC (+ `update_post_with_tags` for edits)
- [x] Upload action: admin check → MD5 dedup → sharp (dimensions + WebP thumb ≤400px) → storage upload → RPC insert, with storage rollback on DB failure (`src/lib/actions/upload.ts`)
- [x] No upload page/form: the posts page is a page-wide drop zone with an Upload button in the header (`src/components/upload-zone.tsx`); every upload lands `general` and untagged, then is tagged from the edit page
- [x] Handle duplicate-MD5 with a friendly "already exists → link to post" error
- [x] No manage-posts page: the post page shows a Manage section to admins — edit tags/rating/source via RPC, plus delete (row + storage files) behind a two-tap confirmation
- [x] Verify: build + lint pass

**Done when:** end-to-end upload works and dedup rejects a re-upload — exercised in
[supabase-setup.md](./supabase-setup.md) step 6.

---

## Phase 3 — Browse

**Goal:** visitors can browse the gallery and view posts. This makes the site *feel* like a booru.

- [x] `lib/data/posts.ts`: `getPosts({page, tag})`, `getPost(id)`, `getPostTags(id)`, `getPostNeighbours(id)`; `lib/data/tags.ts`: `getTagByName`, `getTags`, `groupByCategory`
- [x] Home page: responsive thumbnail grid (2 cols @ 375px → 4 @ sm → 6 @ lg), `next/image` with per-breakpoint `sizes`
- [x] Pagination (page numbers in URL, prev/next)
- [x] Post detail `/posts/[id]`: full image (fit-to-width, tap to open original), tag list grouped by category with Danbooru-style category colors, metadata (size, dimensions, rating, type, source link, date), prev/next post links
- [x] Tags on the detail page link to search: `/?tags=<name>` (single-tag filter until Phase 4)
- [x] Empty states + loading skeletons (`loading.tsx` for grid and detail)
- [x] `next.config.ts` image `remotePatterns` for the Supabase storage host (derived from env)
- [x] Nav wired to real routes (a bottom tab bar at the time; Phase 5 folded it into the sticky top bar)
- [x] Verify: build + lint pass; all public routes render 200 in dev
- [x] Verify: lighthouse mobile pass on home page; grid comfortable at 375px — checked against real posts, 2026-08-29

**Done when:** anonymous visitor can browse grid → open post → tap a tag → see filtered grid.

---

## Phase 4 — Tag search

**Goal:** the defining booru feature — multi-tag search with negation and autocomplete.

- [x] Migration: `search_posts()` function
- [x] `lib/data/search.ts` calling the RPC; `lib/search.ts` parses `?tags=` (space-separated, `-` prefix = exclude)
- [x] Search bar (sticky top on mobile): tokenizes tags as chips, `-tag` supported
- [x] Autocomplete: `searchTags(prefix)` ordered by post_count, debounced 200ms, arrow-key + touch friendly
- [x] Tag sidebar (desktop) / bottom drawer (mobile): tags of the posts on screen with counts, tap to add to search, − to exclude
- [x] Related-tags on post page → tag rows link into search, with an exclude affordance
- [x] `/tags` page: browse all tags by category, sorted by post_count
- [x] Verify: 19 assertions on the query parser pass (`tag_a tag_b -tag_c` parses correctly, dedup, case folding, href building); all routes 200 in dev; build + lint clean
- [x] Verify: `tag_a tag_b -tag_c` returns the correct post set from the database; autocomplete usable with thumb on phone — checked against real data, 2026-08-29

**Done when:** multi-tag AND + negation search works from the URL bar and the UI.

---

## Phase 5 — Polish

**Goal:** production-quality daily-driver.

- [x] Rating filter: `rating:x` / `-rating:x` metatags in the same `?tags=` string (`lib/search.ts` `splitRatings` + `resolveRatings` → the RPC's existing `p_rating`), clickable rating facet in the sidebar/drawer listing every tier — no rating is hidden from any visitor
- [x] SEO: `metadataBase` + title template + OG/Twitter defaults in the root layout, per-post `generateMetadata` (tags in title/description, thumbnail as OG image, `noindex` on the adult tiers), query-aware home metadata (only the plain first page is indexable), canonicals everywhere, `noindex` on `/login`
- [x] `app/robots.ts` and `app/sitemap.ts` (static routes + active posts below the adult tiers, hourly revalidate via the cookie-less `lib/supabase/anon.ts` client)
- [x] Error pages: root `not-found.tsx`, `/posts/[id]/not-found.tsx`, `error.tsx` (Next 16 `retry` prop) and `global-error.tsx`
- [x] Blur placeholders on every remote image (`lib/blur.ts`)
- [x] `getPost` / `getPostTags` / `getCurrentProfile` wrapped in React `cache` so `generateMetadata` and the page share one query
- [x] Verify: build + lint clean; 34 assertions on the query parser and rating resolution pass; all public routes 200 in dev, `/nope` 404s
- [x] Verify: rating filter behaves against real data — checked 2026-08-29, [supabase-setup.md](./supabase-setup.md) step 10

**Dropped 2026-08-29** — this runs as a hobby project on the author's own machine, so the
three deployment steps are not being done and the runbook's steps 11–13 are marked
optional rather than pending:

- ~~Deploy to Vercel + custom domain~~ (step 11) — no public origin, so `NEXT_PUBLIC_SITE_URL`
  stays whatever `.env.local` says and `robots.txt`/`sitemap.xml`/OG URLs are only ever
  read locally.
- ~~Supabase prod hardening~~ (step 12) — the one thing here that is not about a public
  origin is bucket size/MIME caps; the upload action already enforces both.
- ~~Backup story~~ (step 13) — accepted data loss. Nothing here is irreplaceable, and the
  originals exist outside the bucket.

**Done when:** ~~deployed and~~ pleasant to browse daily.
