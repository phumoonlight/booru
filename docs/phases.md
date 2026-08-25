# Implementation Phases — Checklists

Work top to bottom. Check items off (`[x]`) as they're completed and mirror phase
status in [PLAN.md](./PLAN.md). Each phase ends with something verifiable.

---

## Phase 0 — Project scaffold

**Goal:** running Next.js app connected to Supabase, deployable.

- [ ] `npx create-next-app@latest` (TypeScript, App Router, Tailwind, `src/` dir, ESLint)
- [ ] Create Supabase project (cloud); note URL + anon key + service-role key in `.env.local`
- [ ] Install deps: `@supabase/supabase-js`, `@supabase/ssr`, `sharp`, `zod`
- [ ] Supabase CLI init (`supabase init`) so `supabase/migrations/` exists; link to project
- [ ] Client factories in `src/lib/supabase/`: `server.ts` (cookies), `client.ts` (browser), `admin.ts` (service role, server-only)
- [ ] `middleware.ts` with Supabase session refresh
- [ ] Base layout: dark theme, mobile viewport meta, placeholder bottom nav
- [ ] Verify: app runs locally and a test query reaches Supabase

**Done when:** `npm run dev` shows a styled empty shell that successfully talks to Supabase.

---

## Phase 1 — Schema + admin auth

**Goal:** full schema migrated; the admin can log in; `/admin` is guarded.

- [ ] Migration 1: tables `profiles`, `posts`, `tags`, `post_tags` (+ indexes) per [database-schema.md](./database-schema.md)
- [ ] Migration 2: `handle_new_user` trigger, `tag_post_count` trigger, `is_admin()` helper
- [ ] Migration 3: enable RLS + all policies
- [ ] Migration 4: storage buckets `originals`, `thumbnails` + storage policies
- [ ] Create the admin user (signup), promote via SQL (`role='admin'`)
- [ ] `/login` page (email/password) + logout action
- [ ] Guard `/admin/*` in middleware + re-check admin role in every admin server action
- [ ] Verify: non-admin/anonymous gets redirected from `/admin`; RLS spot-checked (anon can select active posts, cannot insert)

**Done when:** schema is live via migrations only, and admin login → `/admin` works on mobile.

---

## Phase 2 — Upload pipeline (admin)

**Goal:** admin uploads an image with tags from a phone; post + thumbnail + tags appear in DB/storage.

- [ ] Migration: `create_post_with_tags` RPC
- [ ] Upload action: zod validation → admin check → MD5 dedup → sharp (dimensions + WebP thumb ≤400px) → storage upload → RPC insert
- [ ] `/admin/upload` form: file picker (`accept="image/*"` — mobile camera/gallery), client-side preview, tag input (free text, space-separated for now), rating select, source URL
- [ ] Handle duplicate-MD5 with a friendly "already exists → link to post" error
- [ ] `/admin/posts`: simple list of recent posts with delete (removes row + storage files) and edit-tags/rating
- [ ] Verify: upload a real image from a phone-sized viewport; confirm files in both buckets, rows in `posts`/`tags`/`post_tags`, `post_count` incremented

**Done when:** end-to-end upload works and dedup rejects a re-upload.

---

## Phase 3 — Browse

**Goal:** visitors can browse the gallery and view posts. This makes the site *feel* like a booru.

- [ ] `lib/data/posts.ts`: `getPosts({page})`, `getPost(id)`, `getPostTags(id)`
- [ ] Home page: responsive thumbnail grid (2 cols @ 375px → 6 @ desktop), `next/image` with proper `sizes`
- [ ] Pagination (page numbers in URL, prev/next; keep it simple)
- [ ] Post detail `/posts/[id]`: full image (fit-to-width, tap to open original), tag list grouped by category with Danbooru-style category colors, metadata (size, dimensions, rating, source link, date)
- [ ] Tags on the detail page link to search: `/?tags=<name>` (works before Phase 4 as single-tag filter)
- [ ] Empty states + loading skeletons
- [ ] Verify: lighthouse mobile pass on home page; grid comfortable at 375px

**Done when:** anonymous visitor can browse grid → open post → tap a tag → see filtered grid.

---

## Phase 4 — Tag search

**Goal:** the defining booru feature — multi-tag search with negation and autocomplete.

- [ ] Migration: `search_posts()` function per [database-schema.md](./database-schema.md)
- [ ] `lib/data/search.ts` calling the RPC; parse `?tags=` (space-separated, `-` prefix = exclude)
- [ ] Search bar (sticky top on mobile): tokenizes tags as chips, `-tag` supported
- [ ] Autocomplete: `searchTags(prefix)` ordered by post_count, debounced, keyboard + touch friendly
- [ ] Tag sidebar (desktop) / bottom drawer (mobile): tags of currently displayed posts with counts, tap to add to search
- [ ] Related-tags on post page → "search this tag" affordances
- [ ] `/tags` page: browse all tags by category, sorted by post_count
- [ ] Verify: `tag_a tag_b -tag_c` returns correct set; autocomplete usable with thumb on phone

**Done when:** multi-tag AND + negation search works from the URL bar and the UI.

---

## Phase 5 — Accounts & favorites

**Goal:** visitors can register and favorite posts.

- [ ] Public signup on `/login` (Supabase email/password; confirm-email setting decided then)
- [ ] Migration: `favorites` table + RLS
- [ ] Favorite button on post page (optimistic toggle via server action)
- [ ] `/account` page: username edit, list of favorites (reuses post grid)
- [ ] `fav:me` style filter or just the favorites page — decide then (page is simpler)
- [ ] Verify: two accounts, favorites isolated by RLS

**Done when:** a fresh user can sign up, favorite a post, and see it in their favorites.

---

## Phase 6 — Polish

**Goal:** production-quality daily-driver.

- [ ] Rating filter (default hide `explicit` for anonymous; user preference later)
- [ ] Infinite scroll on the grid (keep pagination as fallback/SEO)
- [ ] SEO: metadata per post/tag page, OpenGraph images (thumbnail)
- [ ] PWA basics: manifest + icons ("install to home screen")
- [ ] 404/error pages, image loading blur placeholders
- [ ] Deploy to Vercel, custom domain, Supabase prod hardening (auth rate limits, storage size caps)
- [ ] Backup story: enable Supabase PITR or scheduled dumps

**Done when:** deployed, installable on a phone home screen, and pleasant to browse daily.
