# Architecture

A booru-style image board: tag-centric gallery, multi-tag search with negation, post
detail pages. Danbooru is the reference.

**The website is read-only.** It has no accounts and makes one write — the view counter.
Everything that changes the board is the desktop app's, which holds a service-role key
compiled into its own bundle. That single fact explains most of the shape below.

## Three programs

| | | |
|---|---|---|
| `src/` | the website | Next.js 16 App Router on Vercel. Renders the gallery; reads only |
| `packages/desktop` | the uploader and manager | Electron. Uploads, edits, deletes, and manages the tag vocabulary |
| `packages/common` | what both compile | The post shape, the search grammar, the write path, both AVIF encoders |

`packages/common` is reached as `@common/*`, a tsconfig `paths` mapping with no build
step and nothing published. It exists because two programs read the same board and one
writes to it: a second implementation of the query grammar is how `-tag` quietly comes
to mean two different things. Nothing in there may import `next/*`, `server-only` or
React — Electron's main process compiles it. See
[packages/common/README.md](../packages/common/README.md).

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16, App Router | RSC for reads; one Server Action for the view counter |
| Language | TypeScript (strict) | React 19 |
| Styling | Tailwind CSS v4 | Mobile-first, dark theme only, no component library — plain utilities against the CSS variables in `globals.css` |
| Database | Supabase Postgres | Four migrations in `supabase/migrations/`; RLS on every table, select policies only |
| File storage | Supabase Storage | `posts` and `post-thumbnails`, both public-read |
| Auth | none | Removed. Possession of a desktop build is the write authorization |
| Image processing | `sharp` | Both AVIF encoders in `@common/imgcmp/`. Only the desktop app runs them now; the root `tsc` still compiles them |
| Desktop | Electron 44 + electron-vite | Packaged for Windows with electron-builder |
| Deployment | Vercel + Supabase cloud | |

## Repository

```
booru/
├── docs/                      # this file, database-schema.md, design/
├── supabase/
│   ├── migrations/            # four files: storage, posts, tags, post_tags
│   ├── seed.sql               # data, not schema — runs on db:reset only
│   └── config.toml
├── packages/
│   ├── common/src/            # @common/* — one definition of everything shared
│   │   ├── search.ts          # the ?query= grammar, ratings, searchHref
│   │   ├── tags.ts storage.ts # tag charset and colours; md5-derived paths
│   │   ├── data/              # posts, search, shared (writes), tags, counters
│   │   ├── imgcmp/            # for-post.ts, for-thumbnail.ts
│   │   └── upload/pipeline.ts # createPostFromImage — one image in, one post out
│   └── desktop/src/           # main / preload / renderer, plus shared/api.ts
└── src/
    ├── app/(public)/          # page.tsx (landing), posts/, tags/
    ├── components/            # post-feed, post-card, tag-list, rating-list, search-bar…
    └── lib/
        ├── supabase/          # anon.ts (every read), admin.ts (the view counter)
        ├── data/              # @common/data bound to the anon client
        └── actions/           # search.ts (the feed's next chunk), posts.ts (views)
```

No `(auth)/`, no `upload/`, no `tags/manage/`, no `proxy.ts`. All four left when the
board dropped its accounts; git has them.

## Data access

- **Reads:** RSC → `src/lib/data/*` → `@common/data/*` → the anon client. Never query
  Supabase from a page or component. The one read that isn't an RSC is `loadMorePosts`
  in `lib/actions/search.ts` — the feed's next chunk, an action rather than a route
  handler so the data layer stays the only query surface.
- **Writes:** there is one, `recordPostView`, and it runs on the service-role client
  because no table has an update policy. A mutation being added to `src/` is almost
  certainly being added to the wrong program.
- **Two clients, each with one job.** `anon.ts` is cookie-less, so every page stays
  cacheable and every read is the same read for everybody; `admin.ts` is `server-only`
  and never reaches the browser.
- Reads that both `generateMetadata` and the page need (`getPost`, `getPostTags`) are
  wrapped in React `cache`, so each runs once per request.

## The write path (desktop only)

1. A file is staged in the app: within the limits (50MB / 100MP), decodable, preview drawn.
2. `createPostFromImage` computes the md5 of the uploaded bytes and refuses a duplicate —
   that hash is also `posts.file_name`, the name both stored files take.
3. Encode: two lossy AVIFs at quality 50 — a thumbnail (384px tall, width capped at 768
   for panoramas) and the image itself, bounded to 2048 on both sides. The full-size AVIF
   is kept only if it beats the uploaded bytes; otherwise the original is stored
   byte-for-byte. Above the cap it is kept however it measures, being the only version
   inside the bound.
4. Store `posts/{file_name}.{ext}` and `post-thumbnails/{file_name}.avif`, then
   `createPostWithTags()` inserts the row, upserts the tags and links them. No
   transaction: if tagging fails the post is deleted again, counters included.
5. `syncTagPostCounts()` recomputes `tags.post_count` for exactly the tags that moved.

Compression is why this is a desktop app at all: it is seconds of CPU per file, which a
free serverless tier bills by the second and kills at ten.

## Search

- **The URL is the state, and `?query=` is all of it**:
  `/posts?query=blue_hair+solo+-photo+start:900`. Ratings and the cursor ride in the same
  string as metatags — `rating:explicit`, `start:900` — so a saved query is one string
  and the search bar renders every token as a chip you can clear.
- `searchPosts()` in `@common/data/search.ts` runs it, for the website's listing *and*
  the desktop's browse screen. Multi-tag AND is the one thing PostgREST cannot say in a
  single filter, so tag membership is resolved to id lists in TypeScript first and the
  request that follows only filters and orders. It was a `search_posts` SQL function
  early on — faster to write, much harder to change.
- **The listing is a feed, not pages.** The newest screenful is server-rendered; older
  chunks append by cursor (`id < lastId`), never by offset, which slides when an upload
  lands mid-scroll. Nothing counts rows: `hasMore` is one row read past the chunk.
- Tag autocomplete is a prefix match on `tags.name` ordered by `post_count desc`. It uses
  `like`, not `ilike`, because only `like` can use the `text_pattern_ops` index — the
  name check constraint guarantees lowercase, so the results are identical.

## Ratings and SEO

- **Stored as one letter, written as a word.** `posts.rating` holds `g`, `s`, `q` or `e`;
  a query spells `rating:explicit`. `RATING_NAME` in `@common/search` is the only
  translation, and `asRating` reads either form while `ratingToken` only writes the word.
- `RESTRICTED_RATINGS` (`q`, `e`) is kept out of `sitemap.xml` and `noindex`ed, *and*
  left out of every listing until the `nsfw` cookie is set at `/settings`. Not access
  control: a post opened by its own URL renders whatever it holds.
- The cookie is a ceiling `resolveRatings` intersects the query against, applied once in
  `lib/data/search.ts` so every listing and every feed chunk agrees. There used to be a
  rating *blur* here instead — every post sent, some obscured by CSS.
- Absolute URLs (canonicals, OpenGraph, `robots.txt`, `sitemap.xml`) all come from
  `lib/site.ts` → `NEXT_PUBLIC_SITE_URL`, so the origin is configured in one place.
- Search-result URLs are `noindex, follow` and disallowed in `robots.txt` — the
  tag-combination space is unbounded. Post pages and `/tags` carry the indexable content.

## Mobile-first layout

The Danbooru reference is desktop-shaped; translate it like this:

| Danbooru desktop | This project — mobile (default) | This project — desktop (`lg:`) |
|---|---|---|
| Fixed left sidebar (search + tag list) | Sticky top search bar; tag list in a slide-up drawer ("Tags" button) | Left sidebar returns, ~240px |
| Dense thumbnail grid | 2–3 column grid, larger tap targets | 5–6 columns |
| Top nav bar with many links | The sticky bar holds two things: Pubooru · Tags | Same bar, more room |
| Pagination row | A feed — older chunks append as you reach the bottom, `start:<id>` the only cursor | Same |
| Post page: image + sidebar metadata | Image full-width, tags/metadata below | Two-column |

- Thumbnails come from `post-thumbnails`, the post image from `posts`.
- **Compression happens once, at upload.** Both images are `unoptimized`, so the stored
  file is served untouched — animation intact, no second lossy pass. The grid used to go
  through the Next optimizer and it visibly softened thumbnails: Next scales the requested
  quality by 50/80 for AVIF, making the default 75 an AVIF quality of 47, for a resize its
  optimizer could not perform anyway. The cost is that the detail view downloads the full
  image.
- Tap target minimum 44px; design at 375px and scale up with `sm:` / `md:` / `lg:`.
