# Architecture

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (latest, App Router) | RSC for reads, Server Actions for writes |
| Language | TypeScript (strict) | |
| Styling | Tailwind CSS v4 | Mobile-first utilities; dark theme default (booru convention) |
| UI primitives | none | Plain Tailwind against the CSS variables in `globals.css` — no component library |
| Database | Supabase Postgres | Schema in `supabase/migrations/`, RLS enabled on all tables |
| File storage | Supabase Storage | Two buckets: `posts`, `post-thumbnails` (both public-read) |
| Auth | Supabase Auth | Email/password to start; any signed-in user can upload and manage posts |
| Image processing | `sharp` (server-side) | Both AVIF encoders live in `lib/imgcmp/`, shared with the desktop uploader |
| Deployment | Vercel + Supabase cloud | |

## Folder structure (target)

```
booru/
├── docs/                     # this plan
├── supabase/
│   ├── migrations/           # timestamped SQL files — source of truth for schema
│   └── config.toml           # supabase CLI config (local dev)
├── src/
│   ├── app/
│   │   ├── (public)/
│   │   │   ├── page.tsx          # home = post grid
│   │   │   ├── posts/[id]/       # post detail
│   │   │   └── tags/             # tag listing
│   │   ├── (auth)/login/         # login (public signup deferred)
│   │   ├── admin/
│   │   │   ├── upload/           # upload form
│   │   │   └── posts/            # manage/edit/delete posts
│   │   └── layout.tsx
│   ├── components/
│   │   ├── post-grid.tsx, post-card.tsx, tag-sidebar.tsx,
│   │   ├── tag-drawer.tsx        # mobile: sidebar content in a sheet
│   │   └── search-bar.tsx        # with tag autocomplete
│   ├── lib/
│   │   ├── supabase/             # client factories: server.ts, client.ts, admin.ts
│   │   ├── data/                 # ALL queries live here (posts.ts, tags.ts, ...)
│   │   │                         #   → reused by future public API route handlers
│   │   └── actions/              # Server Actions (upload.ts, post.ts, auth.ts, ...)
│   └── proxy.ts                  # Supabase session refresh (Next 16 name for middleware.ts)
└── .env.local                    # NEXT_PUBLIC_SUPABASE_URL / ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```

## Key patterns

### Data access
- **Reads:** RSC → functions in `src/lib/data/` → Supabase server client (anon key,
  RLS enforced). Never query Supabase directly inside page components.
- **Writes:** `"use server"` actions in `src/lib/actions/` → validate with `zod` →
  call `lib/data` or Supabase. Mutating actions check the session via `requireUser()`
  server-side (never trust the client).
- The service-role client (`lib/supabase/admin.ts`) is used **only** where RLS must be
  bypassed (e.g. storage writes during upload), never exposed to the browser.

### Upload pipeline (Phase 2 detail)
1. Client posts `FormData` (file + tags + rating + source) to the upload action.
2. Action: verify session → compute MD5 → reject if a post with that hash exists (dedup)
   → read dimensions with sharp → encode a lossy AVIF thumbnail (400px tall, width
   capped at 800 for panoramas) and try a lossless AVIF of the image itself
   → upload the image to `posts/{md5}.{ext}`, keeping the uploaded bytes byte-for-byte
   when the AVIF didn't beat them, and the thumb to `post-thumbnails/{md5}.avif`
   → `createPostWithTags()` inserts the `posts` row, upserts the tags and links them
   (see database-schema.md) → `revalidatePath('/')`.
3. `MAX_FILE_SIZE` keeps uploads under Vercel's server action body limit. The desktop
   uploader (`packages/desktop`) is the answer to files above it: same pipeline, on a
   real CPU, with its own 50MB/100MP ceiling.

### Search (Phase 4 detail)
- URL is the state: `/?query=blue_hair+solo+-photo&page=2`.
- Query runs through `searchPosts()` in `lib/data/search.ts` (see database-schema.md).
  Multi-tag AND is the one thing PostgREST can't say in a single filter, so tag
  membership is resolved to id lists in TypeScript first and the request that follows
  only filters, orders and counts. It lived in a `search_posts` SQL function early on,
  which was faster to write and much harder to change.
- Tag autocomplete: prefix search on `tags.name` ordered by `post_count desc`, debounced.

### Ratings and SEO (Phase 5 detail)
- Ratings are **metatags inside the same query string**: `rating:general`,
  `-rating:e3`. `lib/search.ts` parses the string once, `splitRatings()` peels the
  metatags off the tag names and `resolveRatings()` turns them into the whitelist
  `searchPosts()` filters `rating` against. Nothing else — chips, tag links,
  autocomplete, pagination hrefs — needs to know they exist.
- No rating is hidden from anyone: the facet lists every tier and `resolveRatings()`
  narrows only when the query names one. The adult tiers (`RESTRICTED_RATINGS`) are
  still kept out of `sitemap.xml` and carry `noindex` — a search-engine policy, not a
  viewer one.
- Absolute URLs (canonicals, OpenGraph, `robots.txt`, `sitemap.xml`) all come from
  `lib/site.ts` → `NEXT_PUBLIC_SITE_URL`, so the origin is configured in one place.
- Search-result URLs are `noindex, follow` and disallowed in `robots.txt` — the
  tag-combination space is unbounded. Post pages and `/tags` carry the indexable content.
- `sitemap.ts` must stay cacheable, so it reads through `lib/supabase/anon.ts`
  (cookie-less) instead of the request-scoped server client.
- Reads that both `generateMetadata` and the page need (`getPost`, `getPostTags`,
  `getCurrentProfile`) are wrapped in React `cache` so each runs once per request.

## Mobile-first layout

The Danbooru reference is desktop-shaped; translate it like this:

| Danbooru desktop | This project — mobile (default) | This project — desktop (`lg:`) |
|---|---|---|
| Fixed left sidebar (search + tag list) | Sticky top search bar; tag list in a slide-up drawer ("Tags" button) | Left sidebar returns, ~240px |
| Dense thumbnail grid | 2–3 column grid, larger tap targets | 5–6 columns |
| Top nav bar with many links | Everything in the sticky top bar: Pubooru · Tags · Log in/out · Upload(signed-in) | Same bar, more room |
| Pagination row | Same — plain pagination, no infinite scroll | Same |
| Post page: image + sidebar metadata | Image full-width, tags/metadata below | Two-column |

- Thumbnails come from the `post-thumbnails` bucket, the post image from `posts`.
- Compression happens **once, at upload**. Both images are `unoptimized`, so the stored
  file is served untouched — animation intact, no second lossy pass. The grid used to go
  through the Next optimizer and it visibly softened thumbnails: Next scales the
  requested quality by 50/80 for AVIF, making the default 75 an AVIF quality of 47, for
  a resize its optimizer could not perform anyway. Cost: the detail view downloads the
  full image.
- Tap target minimum 44px; test at 375px width throughout.
