# Architecture

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (latest, App Router) | RSC for reads, Server Actions for writes |
| Language | TypeScript (strict) | |
| Styling | Tailwind CSS v4 | Mobile-first utilities; dark theme default (booru convention) |
| UI primitives | shadcn/ui (selective) | Dialog/Drawer/Command are the useful ones (drawer nav, tag autocomplete) |
| Database | Supabase Postgres | Schema in `supabase/migrations/`, RLS enabled on all tables |
| File storage | Supabase Storage | Two buckets: `originals`, `thumbnails` (both public-read) |
| Auth | Supabase Auth | Email/password to start; `profiles.role` distinguishes admin |
| Image processing | `sharp` (server-side) | Thumbnail + dimension extraction in the upload Server Action (Node runtime) |
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
│   │   ├── (auth)/login/         # login (admin only — public signup deferred)
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
│   └── middleware.ts             # Supabase session refresh + /admin guard
└── .env.local                    # NEXT_PUBLIC_SUPABASE_URL / ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```

## Key patterns

### Data access
- **Reads:** RSC → functions in `src/lib/data/` → Supabase server client (anon key,
  RLS enforced). Never query Supabase directly inside page components.
- **Writes:** `"use server"` actions in `src/lib/actions/` → validate with `zod` →
  call `lib/data` or Supabase. Admin-only actions check `profiles.role === 'admin'`
  server-side (never trust the client).
- The service-role client (`lib/supabase/admin.ts`) is used **only** where RLS must be
  bypassed (e.g. storage writes during upload), never exposed to the browser.

### Upload pipeline (Phase 2 detail)
1. Client posts `FormData` (file + tags + rating + source) to the upload action.
2. Action: verify admin → compute MD5 → reject if a post with that hash exists (dedup)
   → read dimensions with sharp → generate WebP thumbnail (fit within 400×400)
   → upload original to `originals/{md5}.{ext}` and thumb to `thumbnails/{md5}.webp`
   → insert `posts` row + upsert tags + `post_tags` rows in one RPC (see database-schema.md)
   → `revalidatePath('/')`.
3. Keep files under Vercel's server action body limit; if originals can exceed ~4MB,
   switch to a **signed upload URL** flow (client uploads straight to Storage, then a
   small action finalizes the post). Decide when it first hurts.

### Search (Phase 4 detail)
- URL is the state: `/?tags=blue_hair+solo+-photo&page=2`.
- Query runs through a Postgres function `search_posts(include_tags text[], exclude_tags text[], ...)`
  (defined in database-schema.md) — multi-tag AND + negation is awkward in PostgREST
  syntax, easy in SQL.
- Tag autocomplete: prefix search on `tags.name` ordered by `post_count desc`, debounced.

## Mobile-first layout

The Danbooru reference is desktop-shaped; translate it like this:

| Danbooru desktop | This project — mobile (default) | This project — desktop (`lg:`) |
|---|---|---|
| Fixed left sidebar (search + tag list) | Sticky top search bar; tag list in a slide-up drawer ("Tags" button) | Left sidebar returns, ~240px |
| Dense thumbnail grid | 2–3 column grid, larger tap targets | 5–6 columns |
| Top nav bar with many links | Bottom tab bar: Posts · Search · Upload(admin) · Account | Top nav |
| Pagination row | Same — plain pagination, no infinite scroll | Same |
| Post page: image + sidebar metadata | Image full-width, tags/metadata below | Two-column |

- Use `next/image` with `sizes` set per breakpoint; thumbnails from the `thumbnails` bucket.
- Tap target minimum 44px; test at 375px width throughout.
