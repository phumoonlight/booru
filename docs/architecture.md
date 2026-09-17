# Architecture

An image board of named collections: a shelf list you can search by name, rating and AI,
each shelf a feed of its own images, and a front feed of the newest images across every
shelf. It began as a booru — tag-centric gallery, multi-tag search, Danbooru the reference —
and every post was moved onto a shelf when the two boards were dropped
(`db/migrations/0012_collections_only.sql`). The tag vocabulary is kept for later and is
managed in the desktop app; nothing on the website reads it.

**The website is read-only.** It has no accounts and makes one write — the view counter.
Everything that changes the board is the desktop app's, which holds a writing database
login and a bucket key compiled into its own bundle. That single fact explains most of
the shape below.

## Three programs

| | | |
|---|---|---|
| `src/` | the website | Next.js 16 App Router on Vercel. Renders the shelves; reads only |
| `packages/desktop` | the uploader and manager | Electron. Uploads onto shelves, edits and deletes; manages collections, the tag vocabulary and the artist list |
| `packages/common` | what both compile | The shelf reads and writes, the rating scale, the upload pipeline, both AVIF encoders |

`packages/common` is reached as `@common/*`, a tsconfig `paths` mapping with no build
step and nothing published. It exists because two programs read the same board and one
writes to it: a second implementation of a read is how two windows quietly come to
disagree about what a shelf holds. Nothing in there may import `next/*`, `server-only` or
React — Electron's main process compiles it. See
[packages/common/README.md](../packages/common/README.md).

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16, App Router | RSC for reads; Server Actions for the feeds' next chunks and the view counter |
| Language | TypeScript (strict) | React 19 |
| Styling | Tailwind CSS v4 | Mobile-first, dark theme only, no component library — plain utilities against the CSS variables in `globals.css` |
| Database | Neon Postgres, via `postgres` (porsager) | Numbered files in `db/migrations/`, applied by `scripts/migrate.mjs`. No RLS: three roles and their grants |
| File storage | Cloudflare R2, via `@aws-sdk/client-s3` | One bucket; `collections/` and `artists/` — public-read through a custom domain. The boards' `posts/`, `thumbs/` and `generative/` are orphans |
| Auth | none | Removed. Possession of a desktop build is the write authorization |
| Image processing | `sharp` | Both AVIF encoders in `@common/imgcmp/`. Only the desktop app runs them; the root `tsc` still compiles them |
| Desktop | Electron 44 + electron-vite | Packaged for Windows with electron-builder |
| Deployment | Vercel (`sin1`) + Neon + R2 | |

## Repository

```
booru/
├── docs/                      # this file, database-schema.md, inspiration-ui.png
├── db/
│   ├── migrations/            # 0001_baseline.sql, then one numbered file per change
│   ├── grants.sql             # who may do what — re-applied on every push
│   └── README.md              # the three roles, and how to add a migration
├── scripts/migrate.mjs        # push / list / grant — what replaced the Supabase CLI
├── packages/
│   ├── common/src/            # @common/* — one definition of everything shared
│   │   ├── collections.ts     # the shelves' tables, prefixes, hrefs and filter params
│   │   ├── search.ts          # the rating scale (what is left of the query grammar)
│   │   ├── tags.ts storage.ts # tag charset and colours; md5-derived paths
│   │   ├── data/              # collections, collections-write, tags, rules, form-sections, site, artists
│   │   ├── imgcmp/            # for-post.ts, for-thumbnail.ts
│   │   └── upload/            # pipeline.ts (createCollectionPostFromImage), image.ts, artist.ts
│   └── desktop/src/           # main / preload / renderer, plus shared/api.ts
└── src/
    ├── app/(public)/          # page.tsx (landing), posts/, collections/, settings/
    ├── components/            # site-header, latest-feed, collection-*, image-rows, post-image…
    └── lib/
        ├── db.ts images.ts    # the one pool (booru_web); image URLs off NEXT_PUBLIC_CDN_URL
        ├── latest-posts.ts    # how far /posts goes before it hands over to /collections
        ├── data/              # @common/data bound to that pool, the NSFW ceiling and the maintenance gate
        └── actions/           # collections.ts (both feeds' next chunk, the view), maintenance.ts
```

No `(auth)/`, no `upload/`, no `tags/`, no `ai-posts/`, no `posts/[id]`, no `proxy.ts`. The
first two left when the board dropped its accounts, the rest with the boards; git has them.

## Routes

| | |
|---|---|
| `/` | the front door: the wordmark, 🖼️ Latest and 🗂️ Collections, and how many images there are |
| `/posts` | the newest images across every visible shelf. A **Load more** button, never infinite scroll, up to `LATEST_POSTS_LIMIT` (100) — then the button becomes a link to `/collections`, where the rest is findable |
| `/collections` | the shelf list, most recently touched first, with a plain GET form (`collection-search.tsx`): `?q=` a piece of the name, `?rating=`, `?ai=`. Empty shelves are hidden |
| `/collections/[id]` | one shelf, newest first, appending older chunks as you scroll |
| `/collections/[id]/[postId]` | one image, with prev/next inside its shelf |
| `/settings` | the NSFW checkbox — the site's only preference |
| `robots.txt`, `sitemap.xml` | outside the `(public)` group, so the maintenance switch does not close them |

## Data access

- **Reads:** RSC → `src/lib/data/collections.ts` → `@common/data/collections` → the pool.
  Never query the database from a page or component. The reads that aren't an RSC are
  `loadMoreCollectionPosts` and `loadMoreLatestPosts` in `lib/actions/collections.ts` — the
  feeds' next chunks, actions rather than route handlers so the data layer stays the only
  query surface. `loadMoreLatestPosts` refuses to read past the hundred-image limit for a
  caller that is not the feed.
- **The maintenance gate and the NSFW ceiling are applied in `lib/data/collections.ts`**,
  not in pages. Every read but the sitemap's opens with `serving()`, and every listing and
  feed takes `visibleRatings()`, so no page can forget either and a feed's later chunks
  cannot disagree with its first. `getCollection` takes no ceiling — the page reads the
  shelf's rating to decide on the notice — and neither does the landing page's count.
- **Writes:** there is one, and it is the view counter — `recordCollectionPostView`, then
  `incrementCollectionPostView`. Any other mutation being added to `src/` is almost
  certainly being added to the wrong program, and `booru_web` holds `update (view_count)` on
  `collection_posts` and nothing else anywhere, so the database refuses it rather than a
  reviewer having to.
- **Table names are spelled once**, in `COLLECTION_TABLES` (`@common/collections`), and
  interpolated as identifiers with `db(...)`.
- **One pool, not two clients.** It was `anon.ts` for reads and `admin.ts` carrying a
  service-role key just to count views; a column grant says the same thing and says it
  where it is enforced.
- Reads that both `generateMetadata` and the page need (`getCollection`,
  `getCollectionPost`) are wrapped in React `cache`, so each runs once per request.

## The write path (desktop only)

1. Images are staged onto a shelf in the app: within the limits (`main/limits.ts`, 50MB /
   100MP), decodable, and not already on a shelf — the refusal names which one.
2. `createCollectionPostFromImage` computes the md5 of the uploaded bytes (`inspectImage`)
   and refuses a duplicate across the whole of `collection_posts` — that hash is also
   `file_name`, the name both stored files take.
3. Encode (`encodeImage`): two lossy AVIFs — a thumbnail (384px tall, width capped at 768
   for panoramas, quality 50) and the image itself, bounded to 2560 on both sides, its
   quality on a ramp from 75 at 1280px down to 50 at 1920px. The full-size AVIF is kept only
   if it beats the uploaded bytes; otherwise the original is stored byte-for-byte. Above the
   cap it is kept however it measures, being the only version inside the bound.
4. Store `collections/posts/{file_name}.{ext}` and `collections/thumbs/{file_name}.avif`
   (`storeImage`), then `createCollectionPost` inserts the row and touches the shelf's
   `updated_at` in one transaction. If the insert fails, both objects are removed.

The image carries a source and nothing else: no tags, and no rating — its shelf's is the
rating. `createArtistImageFromImage` runs the same three steps onto `artists/`.

Compression is why this is a desktop app at all: it is seconds of CPU per file, which a
free serverless tier bills by the second and kills at ten.

## Ratings and SEO

- **Stored as one letter, written as a word.** `collections.rating` holds `g` or `r` —
  General and R-18, two tiers where it was Danbooru's four — and it is the rating of every
  image on the shelf. The shelf search spells it `?rating=r18`. `RATING_NAME` in
  `@common/search` is the only translation, and `asRating` reads either form while
  `ratingToken` only writes the word.
- `RESTRICTED_RATINGS` (`r`) is left out of the shelf list, `/posts` and every feed until
  the `nsfw` cookie is set at `/settings`, and a restricted shelf's own page and its image
  pages render `<RestrictedNotice />` — with the metadata cut back to match, since an unfurl
  carries no cookie. Restricted shelves stay out of `sitemap.xml`. Not access control: the
  cookie is a checkbox anyone can tick.
- The cookie is a ceiling: `listCollections` intersects the shelf search's rating with it,
  so asking for R-18 with the setting off finds nothing rather than reaching past it, and
  the list says why. Every image read narrows on the shelf's rating in SQL
  (`shelfVisible`), because the feeds are actions anyone can call with any id.
- Absolute URLs (canonicals, OpenGraph, `robots.txt`, `sitemap.xml`) all come from
  `config.ts` → `NEXT_PUBLIC_SITE_URL`, so the origin is configured in one place — as is
  the board's name, `NEXT_PUBLIC_SITE_NAME`, which defaults to `Booru`.
- **Indexed as shelves.** `/`, `/posts`, `/collections` and each `/collections/[id]` are in
  the sitemap; an individual image and a restricted shelf are `noindex`. A shelf is a fixed listing with a
  name; the images inside it have no words on them and could be a great many. A filtered
  shelf list is `noindex` and its query strings are disallowed in `robots.txt` — it is one
  visitor's slice of a page that is indexed whole.

## Mobile-first layout

| | Mobile (default) | Desktop (`lg:`) |
|---|---|---|
| Navigation | A sticky top bar: the wordmark (to `/posts`) and 🖼️ Posts · 🗂️ Collections · ⚙️ Settings | Same bar, more room |
| Image grids | Justified rows (`image-rows.tsx`): every row spans the width, ratios untouched, one row height per band | Taller rows |
| Shelf list | A card per shelf — mark, name, count and the newest image as its cover, two across | Four across (three at `sm:`) |
| Feeds | `/posts` loads by button up to a hundred; a shelf appends as you scroll. Cursors are ids (`id < lastId`), never offsets | Same |

- **Compression happens once, at upload.** Thumbnails and images are `unoptimized`, so the
  stored file is served untouched — animation intact, no second lossy pass. The grid used
  to go through the Next optimizer and it visibly softened thumbnails: Next scales the
  requested quality by 50/80 for AVIF, making the default 75 an AVIF quality of 47, for a
  resize its optimizer could not perform anyway. The cost is that the image page downloads
  the full image.
- Cards open in a new tab, so following an image does not throw away the chunks loaded
  below the fold.
- Tap target minimum 44px; design at 375px and scale up with `sm:` / `md:` / `lg:`.
