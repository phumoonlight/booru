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
- [x] Base layout: dark theme, mobile viewport meta, placeholder bottom nav
- [x] Home page renders a live Supabase connection-status badge
- [x] Verify: `npm run build`, `npm run lint`, and `npm run dev` all pass

**Done when:** `npm run dev` shows a styled empty shell that successfully talks to
Supabase — the badge turning green is confirmed in
[supabase-setup.md](./supabase-setup.md) steps 1–2.

---

## Phase 1 — Schema + admin auth

**Goal:** full schema migrated; the admin can log in; `/admin` is guarded.

- [x] Migration 1: tables `profiles`, `posts`, `tags`, `post_tags` (+ indexes) — `20260826100000_initial_tables.sql`
- [x] Migration 2: `handle_new_user` trigger, `tag_post_count` trigger, `is_admin()` helper — `20260826100100_functions_triggers.sql`
- [x] Migration 3: enable RLS + all policies — `20260826100200_rls_policies.sql`
- [x] Migration 4: storage buckets `originals`, `thumbnails` + storage policies — `20260826100300_storage_buckets.sql`
- [x] `/login` page (email/password) + logout action (`src/app/(auth)/login/`, `src/lib/actions/auth.ts`)
- [x] Guard `/admin/*` in proxy + `requireAdmin()` helper (`src/lib/auth.ts`) for admin server actions; admin layout re-checks role server-side
- [x] Verify: build + lint pass

**Done when:** schema is live via migrations only, and admin login → `/admin` works on
mobile — creating the admin user and checking the redirects are
[supabase-setup.md](./supabase-setup.md) steps 3–5.

---

## Phase 2 — Upload pipeline (admin)

**Goal:** admin uploads an image with tags from a phone; post + thumbnail + tags appear in DB/storage.

- [x] Migration: `create_post_with_tags` RPC (+ `update_post_with_tags` for edits) — `20260826110000_post_rpcs.sql`
- [x] Upload action: admin check → MD5 dedup → sharp (dimensions + WebP thumb ≤400px) → storage upload → RPC insert, with storage rollback on DB failure (`src/lib/actions/upload.ts`)
- [x] No upload page/form: the posts page is a page-wide drop zone with an Upload button in the header (`src/components/upload-zone.tsx`); every upload lands `general` + `tagme` and is retagged from the edit page
- [x] Handle duplicate-MD5 with a friendly "already exists → link to post" error
- [x] No manage-posts page: the post page shows a Manage section to admins — edit tags/rating/source via RPC, plus delete (row + storage files)
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
- [x] Bottom nav wired to real routes; admin sees the Admin entry
- [x] Verify: build + lint pass; all public routes render 200 in dev, `/admin` redirects anon
- [ ] Verify: lighthouse mobile pass on home page; grid comfortable at 375px — needs real posts, see [supabase-setup.md](./supabase-setup.md) step 6

**Done when:** anonymous visitor can browse grid → open post → tap a tag → see filtered grid.

---

## Phase 4 — Tag search

**Goal:** the defining booru feature — multi-tag search with negation and autocomplete.

- [x] Migration: `search_posts()` function — `20260826120000_search_posts.sql`
- [x] `lib/data/search.ts` calling the RPC; `lib/search.ts` parses `?tags=` (space-separated, `-` prefix = exclude)
- [x] Search bar (sticky top on mobile): tokenizes tags as chips, `-tag` supported
- [x] Autocomplete: `searchTags(prefix)` ordered by post_count, debounced 200ms, arrow-key + touch friendly
- [x] Tag sidebar (desktop) / bottom drawer (mobile): tags of the posts on screen with counts, tap to add to search, − to exclude
- [x] Related-tags on post page → tag rows link into search, with an exclude affordance
- [x] `/tags` page: browse all tags by category, sorted by post_count
- [x] Verify: 19 assertions on the query parser pass (`tag_a tag_b -tag_c` parses correctly, dedup, case folding, href building); all routes 200 in dev; build + lint clean
- [ ] Verify: `tag_a tag_b -tag_c` returns the correct post set from the database; autocomplete usable with thumb on phone — needs real data, see [supabase-setup.md](./supabase-setup.md) step 8

**Done when:** multi-tag AND + negation search works from the URL bar and the UI.

---

## Phase 5 — Polish

**Goal:** production-quality daily-driver.

- [ ] Rating filter (default hide `explicit` for anonymous; user preference later)
- [ ] Infinite scroll on the grid (keep pagination as fallback/SEO)
- [ ] SEO: metadata per post/tag page, OpenGraph images (thumbnail)
- [ ] PWA basics: manifest + icons ("install to home screen")
- [ ] 404/error pages, image loading blur placeholders
- [ ] Deploy to Vercel, custom domain, Supabase prod hardening (auth rate limits, storage size caps)
- [ ] Backup story: enable Supabase PITR or scheduled dumps

**Done when:** deployed, installable on a phone home screen, and pleasant to browse daily.
