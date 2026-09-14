# Architecture

A booru-style image board: tag-centric gallery, multi-tag search with negation, post
detail pages. Danbooru is the reference.

**The website is read-only.** It has no accounts and makes one write — the view counter.
Everything that changes the board is the desktop app's, which holds a writing database
login and a bucket key compiled into its own bundle. That single fact explains most of
the shape below.

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
| Database | Neon Postgres, via `postgres` (porsager) | One baseline in `db/migrations/`, applied by `scripts/migrate.mjs`. No RLS: three roles and their grants |
| File storage | Cloudflare R2, via `@aws-sdk/client-s3` | One bucket; `posts/` and `thumbs/`, the AI board's `generative/` pair, `collections/` and `artists/` — public-read through a custom domain |
| Auth | none | Removed. Possession of a desktop build is the write authorization |
| Image processing | `sharp` | Both AVIF encoders in `@common/imgcmp/`. Only the desktop app runs them now; the root `tsc` still compiles them |
| Desktop | Electron 44 + electron-vite | Packaged for Windows with electron-builder |
| Deployment | Vercel (`sin1`) + Neon + R2 | |

## Repository

```
booru/
├── docs/                      # this file, database-schema.md, design/
├── db/
│   ├── migrations/            # 0001_baseline.sql — the whole schema, plus the grants
│   └── README.md              # the three roles, and how to add a migration
├── scripts/migrate.mjs        # push / list / grant — what replaced the Supabase CLI
├── packages/
│   ├── common/src/            # @common/* — one definition of everything shared
│   │   ├── search.ts          # the ?query= grammar, ratings, searchHref
│   │   ├── board.ts collections.ts # the two boards' names; the shelves', which are not one
│   │   ├── tags.ts storage.ts # tag charset and colours; md5-derived paths
│   │   ├── data/              # posts, search, shared (writes), tags, counters, collections
│   │   ├── imgcmp/            # for-post.ts, for-thumbnail.ts
│   │   └── upload/pipeline.ts # createPostFromImage — one image in, one post out
│   └── desktop/src/           # main / preload / renderer, plus shared/api.ts
└── src/
    ├── app/(public)/          # page.tsx (landing), posts/, ai-posts/, collections/, tags/
    ├── components/            # post-feed, post-card, tag-list, rating-list, search-bar…
    └── lib/
        ├── db.ts images.ts   # the one pool (booru_web); image URLs off NEXT_PUBLIC_CDN_URL
        ├── data/              # @common/data bound to that pool
        └── actions/           # search.ts (the feed's next chunk), posts.ts and collections.ts (views)
```

No `(auth)/`, no `upload/`, no `tags/manage/`, no `proxy.ts`. All four left when the
board dropped its accounts; git has them.

## Data access

- **Reads:** RSC → `src/lib/data/*` → `@common/data/*` → the pool. Never query the
  database from a page or component. The one read that isn't an RSC is `loadMorePosts`
  in `lib/actions/search.ts` — the feed's next chunk, an action rather than a route
  handler so the data layer stays the only query surface.
- **Writes:** there is one, and it is the view counter — `recordPostView` for a post,
  `recordCollectionPostView` for a shelved image. Any other mutation being added to `src/`
  is almost certainly being added to the wrong program, and `booru_web` holds `update
  (view_count)` on those three tables and nothing else anywhere, so the database refuses it
  rather than a reviewer having to.
- **Two boards, one set of functions.** `/posts` and `/ai-posts` read `posts` and
  `generative_posts`; every function in `@common/data/*` takes a `Board` and gets its table
  names from `@common/board`, defaulting to the gallery. The website's pages are the same
  pair of components (`PostListing`, `PostDetail`) rendered with a different board.
- **Collections are the exception to the board pattern.** `/collections` reads
  `collections` and `collection_posts`, which have no tags, no search and no `Board`: the
  reads are `@common/data/collections` and take a collection id and a cursor. See
  [database-schema.md](database-schema.md#collections-collection_posts) for why that is two
  tables rather than a third board.
- **One pool, not two clients.** It was `anon.ts` for reads and `admin.ts` carrying a
  service-role key just to count views; a column grant says the same thing and says it
  where it is enforced.
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
4. Store `posts/{file_name}.{ext}` and `thumbs/{file_name}.avif` — or the AI board's
   `generative/` pair, whichever board is being written — then `createPostWithTags()`
   inserts the row and links its tags inside one transaction. Every name has to be a tag
   already: no write path coins one.
5. `syncTagPostCounts()` recomputes that board's count column for exactly the tags that
   moved.

`createCollectionPostFromImage` is steps 1–4 into `collections/` with step 5 and the tags
taken out. Steps 2 and 3 are literally the same code — `inspectImage`, `encodeImage`,
`storeImage` in `@common/upload/pipeline.ts` — because the compression is an argument about
bytes and has nothing to do with what table the row lands in.

Compression is why this is a desktop app at all: it is seconds of CPU per file, which a
free serverless tier bills by the second and kills at ten.

## Search

- **The URL is the state, and `?query=` is all of it**:
  `/posts?query=blue_hair+solo+-photo+start:900`. Ratings and the cursor ride in the same
  string as metatags — `rating:r18`, `start:900` — so a saved query is one string
  and the search bar renders every token as a chip you can clear.
- `searchPosts()` in `@common/data/search.ts` runs it, for the website's listing *and*
  the desktop's browse screen, and it is **one statement**: a correlated count for the
  included tags and a `not exists` for the excluded ones, both matched by name so nothing
  has to be resolved to ids first. Empty arrays degrade correctly — a count of 0 against 0
  passes, a `not exists` over nothing is true — so it is one fixed query for every shape a
  search bar can produce. It was a `search_posts` SQL function early on, then about a
  hundred lines of TypeScript intersecting `post_tags` in thousand-row pages, which is
  what a multi-tag AND cost under PostgREST.
- **The listing is a feed, not pages.** The newest screenful is server-rendered; older
  chunks append by cursor (`id < lastId`), never by offset, which slides when an upload
  lands mid-scroll. Nothing counts rows: `hasMore` is one row read past the chunk.
- Tag autocomplete is a prefix match on `tags.name` ordered by `post_count desc`. It uses
  `like`, not `ilike`, because only `like` can use the `text_pattern_ops` index — the
  name check constraint guarantees lowercase, so the results are identical.

## Ratings and SEO

- **Stored as one letter, written as a word.** `posts.rating` holds `g` or `r` — General
  and R-18, two tiers where it was Danbooru's four; a query spells `rating:r18`.
  `RATING_NAME` in `@common/search` is the only translation, and `asRating` reads either
  form while `ratingToken` only writes the word.
- `RESTRICTED_RATINGS` (`r`) is kept out of `sitemap.xml` and `noindex`ed, left out
  of every listing until the `nsfw` cookie is set at `/settings`, and blocked on its own
  page — `<RestrictedNotice />`, with the metadata cut back to match, since an unfurl
  carries no cookie. Not access control: the cookie is a checkbox anyone can tick.
- The cookie is a ceiling `resolveRatings` intersects the query against, applied once in
  `lib/data/search.ts` so every listing and every feed chunk agrees. There used to be a
  rating *blur* here instead — every post sent, some obscured by CSS.
- Absolute URLs (canonicals, OpenGraph, `robots.txt`, `sitemap.xml`) all come from
  `config.ts` → `NEXT_PUBLIC_SITE_URL`, so the origin is configured in one place — as is
  the board's name, `NEXT_PUBLIC_SITE_NAME`, which defaults to `Booru`.
- Search-result URLs are `noindex, follow` and disallowed in `robots.txt` — the
  tag-combination space is unbounded. Post pages and `/tags` carry the indexable content.
- Collections are indexed **as shelves**: `/collections` and each `/collections/[id]` are in
  the sitemap, and an individual image is `noindex, follow`. A shelf is a fixed listing with
  a name; the images inside it have no words on them and could be a great many.

## Mobile-first layout

The Danbooru reference is desktop-shaped; translate it like this:

| Danbooru desktop | This project — mobile (default) | This project — desktop (`lg:`) |
|---|---|---|
| Fixed left sidebar (search + tag list) | Sticky top search bar; tag list in a slide-up drawer ("Tags" button) | Left sidebar returns, ~240px |
| Dense thumbnail grid | 2–3 column grid, larger tap targets | 5–6 columns |
| Top nav bar with many links | The sticky bar holds the wordmark and three or four items: 🤖 AI posts (behind a cookie) · 🗂️ Collections · 🏷️ Tags · ⚙️ Settings | Same bar, more room |
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
