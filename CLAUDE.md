@AGENTS.md

# Pubooru

An image board of hand-kept collections: named shelves of images, each with tags of its
own, a feed of the newest, and a page per image. It began as a booru-style tag gallery
(Danbooru was the reference); every post has since been moved onto a shelf, and the
board-wide tag vocabulary is kept for a later use — a shelf's tags are separate tables. Next.js 16 App Router, Neon Postgres, Cloudflare R2, Tailwind v4, mobile-first.

**The website is read-only and has no accounts.** Everything that changes the board —
naming and filling shelves, moving and deleting images, the artist list, the tag
vocabulary — happens in the desktop app, which writes with a Postgres login and a bucket
key compiled into its own bundle. Most of the shape below follows from that one fact.

| | | |
|---|---|---|
| `src/` | the website | Next.js on Vercel. Renders the shelves; reads only |
| `packages/desktop` | the Electron app | Shelves, images, artists, tags |
| `packages/common` | `@common/*` | What both compile: the collection shape, the write path, the ratings, the encoders |

## Replies

- Be extremely concise. Lead directly with the result or fix.
- Omit all conversational preambles, narration, and filler phrases.
- Do not explain code changes unless explicitly asked.
- Link files (`[file.ts:42](src/file.ts#L42)`) instead of pasting code back.

**After making a change, say what changed in a sentence or two and stop.** No summary of
the work, no per-file breakdown, no bold-headed sections, no restating reasoning that is
already a comment in the code. The diff is visible; describing it back is the single
biggest source of length here. "Done — `X` in [file.ts:42](src/file.ts#L42)" is a
complete answer.

Three things earn more room, and nothing else does: something failed, something is about
to be destructive, or a question was asked. A question asked in one line does not get an
essay either — answer it, then offer the detail rather than supplying it.

## Commands

| | |
|---|---|
| `npm run dev` / `build` / `lint` | the only verification the repo has — there is no test runner |
| `npm run typecheck -w desktop` | the only check the Electron app has; the root `tsc` covers `src/` and `packages/common`, not the desktop |
| `npm run db:push` / `db:list` | apply pending migrations, after naming them and the board and asking / say what is applied. `scripts/migrate.mjs`, as `booru_owner` |
| `npm run desktop:dev` / `desktop:package` | window, or installer. Both need the seven env values |
| `npm run bench:avif` | sweeps AVIF `effort` through both encoders over `tests/bench/example.jpg` |

`tests/` is not a suite and there is no runner — it is the AVIF bench and its sample
image, kept because the numbers behind `@common/imgcmp/` are worth re-measuring. Ad-hoc
checks belong in the scratchpad, uncommitted. Don't add a test setup unless asked.

## Git

**Commit on `main`. Do not create a branch unless asked.** Solo repo, linear history; a
branch per change adds a merge step the author then undoes.

Commit only when asked. Never push unless asked.

## Invariants

Break one of these and something fails silently. They are the reason for most of the
structure further down. The numbers are cited from code comments, so a rule that goes
takes its number with it rather than shifting the rest.

1. **Never query the database from a page or component.** Reads go RSC →
   `src/lib/data/*` → `@common/data/*`.
2. **Never add a write to `src/`.** `booru_web` may `select` everywhere but the artist
   tables and `update (view_count) on collection_posts`, and holds no other write grant —
   so the database refuses one rather than a reviewer having to. Mutations belong in
   `packages/desktop`.
3. **Nothing in `packages/common` builds a client** — the caller passes a `Db`, and the
   upload also takes an `ObjectStore`. `src/lib/db.ts` is `server-only` and reads the
   environment, so a module that built its own could not run in Electron.
4. **Nothing in `packages/common` imports `next/*`, `server-only` or React**, reads the
   environment, or hardcodes a limit. Electron's main process compiles these files.
5. **A write that opens a transaction takes the pool, not a `Db`** — `createCollectionPost`,
   `deleteCollectionPostRow`, `moveCollectionPosts` and `deleteArtistRows`. Everything else
   takes `Db` (postgres.js's `ISql`) so it can also be called *inside* one, which is how
   `touchCollection` lands in the same transaction as the change it records.
6. **No write path coins a tag.** A shelf's tag is made by ➕ New tag on that shelf, and
   `setCollectionPostsTag` takes its *id*. For the board-wide vocabulary, `resolveTagIds`
   (`@common/data/shared`) reads the names it is given and throws naming the ones the board
   has no row for, so a tag rule or a
   section's condition naming something that isn't a tag yet fails. Creating one is
   ➕ New tag on the desktop Tags screen and nothing else. The old `on conflict do nothing`
   upsert also made Postgres draw the identity default before testing the conflict, so
   every save spent a `tags.id` per tag it already had.
7. **A Tailwind class in `packages/common` needs an `@source` line** in
   `packages/desktop/src/renderer/src/styles.css`, or it compiles to nothing in the
   desktop build. Currently the category colours behind `categoryColor` (`@common/tags`),
   its plain-foreground fallback included, and `RATING_COLOR` (`@common/search`). The
   failure can be *partial*, where a hex shared with another scanned constant happens to
   survive.
   The same shape of trap one language down: **an SQL comment inside a tagged template is
   still inside a JavaScript string**, so a backtick in one ends the query and TypeScript
   reports the parse error somewhere else entirely. The queries in `@common/data/*` keep
   their commentary above the template.
8. **`@common/collections` is the only thing that spells a collection's address** —
   `collectionsHref(filter)`, `collectionHref`, `collectionPostHref` — and
   `COLLECTION_FILTER_PARAMS` / `readCollectionFilter` the only spelling of the shelf
   list's search. The form that writes a search and the page that reads it back cannot
   disagree while both go through here.
9. **An image has no rating of its own; its shelf's is the rating.** Every read of an image
   in `@common/data/collections` narrows through `shelfVisible`, and both feeds are actions
   anybody can call with any cursor — a new image read that skips it puts a restricted
   shelf's images one request from the notice.
10. **A table name is never spelled in a collection or artist query** — `COLLECTION_TABLES`
   in `@common/collections` and `ARTIST_TABLES` in `@common/artists` hold them, and every
   query interpolates them with `db(...)`, as identifiers. A table name typed into a
   template is a table name that can be typed wrong.
11. **Re-measure with `npm run bench:avif` before changing a constant in
   `@common/imgcmp/`.** Those numbers were measured, not chosen.
12. **`select count(*)` needs `::int`.** postgres.js hands a `bigint` back as a *string*,
    to avoid silently losing precision. That is also why the id columns are `integer`
    rather than `bigint` — see the baseline migration's note.
13. **Every change under `packages/desktop` raises the version in
    `packages/desktop/package.json`.** About reads it (`app.getVersion()`) and
    electron-builder stamps it on the installer, so a build that was not bumped is
    indistinguishable from the one before it — on screen and on disk alike.
14. **A collection cannot be deleted while it holds anything.** `collection_posts.collection_id`
   has no `on delete cascade`, which is the enforcement; `deleteCollection` counts first only
   so the refusal can say how many are in the way. It is the only container this project has,
   and deleting one by accident would take a set of images that exist nowhere else.
15. **Artists are the desktop app's alone.** `booru_web` has no grant on `artists`,
   `artist_urls` or `artist_images`, so nothing in `src/` may read them — the query would be
   refused. An artist touches no tag or collection either; see [Artists](#artists).

## Layering

- **Reads:** RSC → `src/lib/data/*` → `@common/data/*` → the pool. The two reads that
  aren't an RSC are `loadMoreCollectionPosts` and `loadMoreLatestPosts` in
  `lib/actions/collections.ts` — a feed's next chunk, as actions rather than route handlers
  so the data layer stays the only query surface.
- **The website's only write is the view counter** — `recordCollectionPostView` — because a
  visitor's view still counts. It is `update collection_posts set view_count = view_count +
  1` — atomic again, where PostgREST forced a three-attempt compare-and-swap that dropped
  the view under contention.
- **One pool, `src/lib/db.ts`**, `server-only`, connecting as `booru_web`. It was two
  clients — an anon one for reads and a service-role one that could bypass every policy
  in the project, held solely to count views. A column grant says that better.
- **Query logic lives in `lib/data/` and `@common/data/`**, never in actions or pages, so
  a second caller can reuse it — which is how the desktop app lists the same shelves.
- **Pure helpers** (`@common/search`, `@common/tags`, `@common/collections`,
  `@common/storage`, the web's `config.ts` and `lib/images.ts`) import nothing
  server-side, so client components can share them.
- **`src/config.ts` is the website's only `process.env`.** The name (`SITE_NAME`, from
  `NEXT_PUBLIC_SITE_NAME`, defaulting to `Booru`), the origin, the image host and the
  connection string are read there and nowhere else, so a misconfigured deployment is
  one file to read. It is not `server-only` — the name is drawn by client components —
  which is safe because Next inlines `NEXT_PUBLIC_*` and nothing else.

## `packages/common`

The collection reads and writes, the upload pipeline, the tag vocabulary, both encoders,
and the pure helpers. See [packages/common/README.md](packages/common/README.md).

- **`@common/*` is a tsconfig `paths` mapping** to `packages/common/src`. No build step,
  nothing published; files in there import each other by `@common/…` too, so a module
  reads the same wherever it is compiled. The web gets the mapping from the root
  `tsconfig.json`; the desktop needs it twice — `packages/desktop/tsconfig.json` for the
  type checker and a Vite alias in `electron.vite.config.ts` for the bundler.
- **The handle is an argument, never a construction.** `@common/data/*` takes a `Db`;
  `@common/upload/pipeline` (`createCollectionPostFromImage`) takes the pool and an
  `ObjectStore`. Don't simplify either parameter away — that is what lets the same files
  compile in a server render and in Electron's main process.
- **`@common/search` is what is left of the search grammar**: the rating vocabulary and
  `tagLabel`. `@common/data/shared` is `resolveTagIds` and `listTags`.

## The website (`src/`)

- **Eight routes**, and the only thing any of them writes is a view counter: `/`,
  `/posts`, `/collections`, `/collections/[id]`, `/collections/[id]/[postId]`, `/settings`,
  `robots.txt`, `sitemap.xml`. There is no `/upload`, `/login`, `/account`, `/posts/[id]`,
  `/ai-posts` or `/tags`, and no `src/proxy.ts` (Next 16's `middleware.ts`) — see
  [History](#history).
- **The whole site closes behind one row.** `site_settings.maintenance`, flipped from the
  desktop app's settings screen, and read in `src/app/(public)/layout.tsx` — a layout
  rather than a proxy, since the site has none and the pool is already here. Closed, every
  route in the group is `<MaintenanceNotice />` instead; `robots.txt` and `sitemap.xml` sit
  outside it on purpose, being what a crawler reads to decide whether to come back. The
  read is **asymmetric** (`lib/data/site.ts`): a serving board is asked on every visit,
  because a switch nobody feels is worthless, and a closed one is held for ten minutes,
  because a visitor refreshing the notice is the traffic a closed site actually gets. Only
  the "on" answer is cached, and Check status — a server action that drops the hold and
  reports what the board said — is the way out of the window. An unreadable table is
  treated as serving: a blip must not close the site. Every read in
  `lib/data/collections.ts` also opens with `serving()`, since a layout decides what is
  drawn and does not stop the segment underneath from running.
- **`/` is a front door**: the wordmark, two doors (🖼️ Latest and 🗂️ Collections), and an
  emoji count of the images on every shelf, adult ones included — a number says nothing
  about what is behind the setting. It awaits `connection()`, since with no search box left
  nothing else makes it render per request. **The header** (`site-header.tsx`) is the
  wordmark, going to `/posts`, and three items: Posts, Collections, Settings.
- **Nothing goes through the Next optimizer.** The grid thumb and the image page are both
  `unoptimized`, so the stored file is served untouched — animation intact, no second
  lossy pass. The grid used to be optimized and visibly softened thumbnails: Next scales
  the requested quality by 50/80 for AVIF, so the default 75 became quality 47 at effort
  3, for a resize its optimizer could not perform anyway (`withoutEnlargement`).
- **The adult tier is off by default, behind one cookie.** `/settings` is the site's only
  preferences page and NSFW its only setting; `lib/nsfw.ts` holds the cookie's spelling and
  `lib/nsfw-server.ts` reads it, split because the control that writes it is a client
  component and `next/headers` anywhere in that import graph is a build error.
  `lib/data/collections.ts` passes `visibleRatings()` to every read, so a page cannot
  forget and a feed's later chunks cannot disagree with its first. It replaced a CSS blur —
  an attribute on `<html>` set before first paint — which sent every post and obscured
  some of them client-side.
- Pages fall back to `<SetupNotice />` when `isDatabaseConfigured()` is false, so the app
  is browsable before the environment file has been filled in.
- **Image URLs are the web's own** (`lib/images.ts`), built from `NEXT_PUBLIC_CDN_URL` and
  `@common/storage`'s path builders. The base used to be read inside the shared module,
  which broke invariant 4 quietly and made the desktop app set a `NEXT_PUBLIC_*` variable
  on itself at startup to satisfy it.

## Collections

**The site.** A shelf is a named set of images, like a photo app's album; `/collections`
is a card per shelf with its name and a cover, and each one opens onto its own images,
newest first. Every post and AI post was moved onto one (0012), so there is no other kind
of image on the board.

- **An image is its bytes, its source and its shelf's tags.** An md5 name, two stored
  objects, a view counter, a `source_url` and a `collection_id`, and no rating of its own
  (invariant 9).
- **Tags belong to a shelf** (0013: `collection_tags`, `collection_post_tags`), not to the
  board: `landscape` on two shelves is two rows, and neither is a `tags` row. That table's
  name is globally unique and carries categories, marks, a rating floor and form rows, none
  of which a shelf's word has, so it was not reused. A tag is **made on its shelf, then put
  on images** by id — nothing coins one. Names take the vocabulary's grammar
  (`readCollectionTagName`). A tag's **mark** is a colour (a dot, `markColor` deciding) or
  any short text — an emoji, `[WIP]` — settled by `readCollectionTagMark`. **A moved image leaves its tags behind**, deleted in the move's
  transaction. **No tag write touches the shelf**: a tag is a word about images, like a
  source. Counts are counted in the read.
- **A shelf's page has a pill per tag above its images** (`collection-tag-bar.tsx`), each a
  link: pressed, it narrows the shelf to images carrying it, and lit pills combine as
  **AND** (`postHasTags`). The filter is `?tags=a+b`, spelled by `collectionHref(id, tags)`,
  read by `readCollectionTags`, toggled by `toggleCollectionTag`; the feed's later chunks
  carry it through `loadMoreCollectionPosts`, and a filtered shelf is `noindex` with
  `robots.txt` disallowing `/collections/*?`. An image page links its tags back the same
  way.
- **A shelf is a name, a mark, a rating and an AI flag.** The **rating** is every image's
  on it (0011, and 0012 dropping `collection_posts.rating`): restricted, the shelf is off
  the list and out of the sitemap, its page and every image page inside it are
  `<RestrictedNotice />`, and its metadata is titled like nothing in particular, since an
  unfurl is the reader who has not asked. The **mark** is a short prefix drawn in front of
  the name — 🎴, `[WIP]`, `2024` — and is not a tag's mark: anything typed, twelve
  graphemes at most, settled by `readCollectionMark`. **`is_ai`** is what the AI board was,
  as a fact about a shelf: a boolean rather than a table, because the split that made
  `generative_posts` a table was about tag counts and listings that must not mix, and a
  shelf has neither. The website filters on it; nothing else reads it.
- **The vocabulary is `@common/collections`** — the two table names, the two object
  prefixes, the hrefs, the filter params, `readCollectionName` and `readCollectionMark` —
  and its queries are `@common/data/collections` and `collections-write`.
- **An image lives on exactly one shelf**, which `collection_posts.file_name unique` says
  as well as the feature does: one name is one pair of stored objects, so two rows would be
  two rows that break each other on delete. Staging says so before anything is uploaded,
  and names the shelf — "already in Ukiyo-e studies" is a refusal somebody can act on.
- **The cover is derived, not stored**: the newest image on the shelf. A `cover_post_id`
  would be a circular foreign key, a null to handle on every delete and a picker nobody
  asked for, to answer a question the newest image already answers.
- **The list is ordered by `updated_at`**, touched by an edit to the shelf and by every
  image added, removed or moved — in TypeScript (`touchCollection`), inside the same
  transaction as the change, because this schema has no triggers. Correcting one image's
  source does *not* touch it: that ordering answers "what has happened to this shelf", and
  a source is a fact about one image.
- **A shelf cannot be deleted while it holds anything** — invariant 14.
- **The website hides an empty shelf and the desktop app does not** (`hideEmpty`). A card
  with a name, no picture and a count of zero is an invitation to click on nothing; a shelf
  you have just named is exactly the row you are looking for in the app.
- **`/collections` has the site's only search** (`collection-search.tsx`) — a shelf's tag
  pills are a filter, not a search: a piece of the
  name, a tier, AI or not. **A plain GET form**, so a search is a URL — shareable,
  back-buttonable, working without JavaScript — read back loosely by `readCollectionFilter`,
  which drops a value it does not recognise rather than refusing the page. The rating
  filter narrows within the NSFW ceiling and never lifts it: asking for R-18 shelves with
  the setting off finds none and says why, with a link to `/settings`. A filtered list is
  `noindex` and `robots.txt` disallows `/collections?` — one visitor's slice of a page that
  is indexed whole.
- **`/posts` is the newest images across every visible shelf** (`latest-feed.tsx`) — the
  address the gallery had, kept because the wordmark and every old link go there. **A
  button, never a scroll**, and **a hundred images at most** (`LATEST_POSTS_LIMIT`,
  `src/lib/latest-posts.ts`, which the action enforces too): the gallery this replaced was
  a search you worked through, where this is a front page with a horizon, and a feed that
  grows under the scroll reaches its end without anybody asking it to. At the limit, or the
  last image, the button becomes a link to `/collections`, where the rest can be found
  rather than scrolled past.
- **A shelf's own page does scroll** (`collection-feed.tsx`): a shelf is a set somebody
  chose to open and is read to its end. Both feeds page by cursor (`id < lastId`), never by
  offset, which slides when an image lands mid-scroll; each chunk keeps its own `<ul>` so a
  landing chunk can't reflow rows already on screen; `hasMore` is one row read past the
  chunk — nothing counts. An image page's prev/next walks its own shelf.
- **Indexed as shelves.** `/collections` and each `/collections/[id]` are in
  `sitemap.xml`; an individual image is `noindex, follow`. A shelf is a fixed listing with
  a name; the images inside it have no words on them and could be a great many.
- **The desktop screen is 🗂️ Collections**, the one the window opens on. A shelf is named
  and edited with one form — mark, name, rating, 🤖 AI — because a shelf made without a
  rating is the R-18 shelf that turns up with the setting off. Adding images is **a batch
  of files, one source and the shelf's tags to carry**: there is nothing else per image to
  type, and the source is what images arriving together usually share — they are the four in
  one post. The tags are pills of the shelf's existing tags, linked by id inside the insert's
  transaction (`createCollectionPost`), so a batch lands tagged rather than being tagged image
  by image afterwards. Source and tags are cleared with the staged files once the batch has
  landed — they belonged to those images, and a box still holding the last post's answers is
  how the next batch quietly gets the wrong ones. **A drag anywhere over the shelf opens the upload box and leaves it open**, its
  handlers sitting on a wrapper that fills the scroller rather than on the `max-w-6xl`
  column, which left most of a wide window looking like a drop target without being one. An
  image's own panel is its **tags** (every shelf tag as a pill, lit if carried, written on
  the press) and its **source, read until ✏️ Edit asks for the box** — it was written
  on blur, so the one field there could be changed by clicking into it and tabbing away —
  **🔍 Full size**, and a held Delete.
- **The desktop shelf has the tag bar too** (`collection-tags.tsx`): pills that narrow the
  grid, ➕ New tag, and ✏️ Edit tags, in which a click picks a pill to rename or hold-delete
  instead of filtering. 🗂️ Manage's bar puts a picked tag on the selection or takes it off
  (🏷️ Tag / 🧽 Untag). The shelf's page cache is keyed by the lit pills as well as the cursor.
- **The desktop screen has a search of its own**, and it is not the website's: a box
  narrowing the list the window is already holding in full (it has to hold it — an image's
  panel offers moving it to any other shelf), over the mark, the name and `#id`. No read, no
  URL, and an answer between keystrokes.
- **Images are moved to another shelf as a selection, and no bytes move.** 🗂️ Manage turns
  the grid into a picker — a click ticks a tile instead of opening its panel — and a bar
  offers Select all, Select none and a menu of every *other* shelf with ➡️ Change
  collection (`collection-manage.tsx`). It was a menu on each image's panel, which made
  sorting forty images forty trips. The flat `collections/posts/<md5>` prefix is what makes
  a move one column per row (`moveCollectionPosts`, one statement for the whole selection);
  every shelf an image left and the one they arrived on have `updated_at` touched in the same
  transaction, and an image already on the destination is skipped rather than written.

## Artists

A reading list on the desktop app — 🎨 Artists — and **nowhere else**: not on the website
(invariant 15), not a tag (the `artist` tag category is unrelated), not a collection.
`@common/artists` spells its tables, prefixes and what a name and an address are;
`@common/data/artists` and `artists-write` are its queries; `@common/upload/artist` is the
shared encode onto `artists/images/` and `artists/thumbs/`.

- **An artist is a name, many links and many example images**, plus `read_at`, `is_ai`,
  `archived_at` and `is_favorite`.
  No other field, on purpose.
- **Non-AI and AI are two lists on one screen**, a segment switch in the title row that
  opens on non-AI. A column, not a second table: this list has one read that splits the
  rows as it draws them. Moving an artist across keeps `read_at`, and the screen follows it
  over with the editor still open.
- **An archive beside the reading list** (`archived_at`, null while on the list), split into
  non-AI and AI the same way, for artists no longer posting who are still worth the record.
  Newest archived first, the date on each card. **An archived artist cannot be marked read**
  — refused in the statement, not only by the button being absent. Archive is in the editor
  (one press); Unarchive is on the archived card and leaves `read_at` alone, so the artist
  goes back where their last read puts them.
- **⭐ Favorites is a second reading list on a tab of its own** (`is_favorite`), between the
  reading list and the archive: read, ordered and marked exactly the same, kept apart so the
  few never to fall behind on are not buried. A boolean, not a date — nothing orders by when
  one was made a favourite. The archive wins while set and the flag stays underneath, so an
  archived favourite unarchives back onto the favourites. Toggled in the editor beside
  Archive; an artist named on the Favorites tab is made one.
- **The order is the feature: `read_at asc nulls first`.** Never-read at the top, then the
  longest since caught up on. There is no read/unread flag — how far behind you are is a
  date, and a boolean beside it is a second answer that could disagree.
- **Mark read is held, not clicked** (`HoldButton`, 700ms). It has no undo and sends the
  card to the bottom, out from under the pointer, so a stray click must not reach it; a
  confirm dialog would be a second click on every use. It writes the database's `now()`.
- **Examples are uploaded, never linked.** A link would need the window's CSP loosened or a
  fetch per view in main, and pixiv refuses that fetch without its own `Referer`; links to
  someone else's image also die. A drag out of a browser is still accepted — it is
  downloaded and uploaded like a file.
- **A link is unique across every artist**, and so is an example's md5: pasting an address
  already saved names who has it, which is how a second row for one person is caught.
- **Deleting an artist takes its links, its examples and their stored objects.** Unlike a
  shelf, what is lost is a copy of work that exists elsewhere.

## The desktop app (`packages/desktop`)

Everything that writes, as a desktop app, because compression is CPU work a free
serverless tier is bad at — see [packages/desktop/README.md](packages/desktop/README.md).
It imports `packages/common` and reaches into `src/` not at all.

**Process split**

- The renderer has no keys, no Node and no network. Every capability is one
  `ipcMain.handle`, registered from `src/main/ipc.ts` (one `ipc-*.ts` per area — app,
  files, tags, collections, artists); the file's bytes are read on the main side.
- **Two handles, both compiled in.** `main/db.ts` is the board's pool as `booru_app` —
  reads and writes every row, owns nothing, so a string extracted from a bundle can
  vandalise the data and cannot drop a table. `main/r2.ts` is the bucket, and the only
  implementation of `ObjectStore`. Neither signs in to anything.
- **Its limits are its own** (`main/limits.ts`, 50MB / 100MP) and now the only ones.
- Renderer CSP is `img-src 'self' data:`. Thumbnails cross the bridge as `data:` URLs
  rather than being fetched by the page — a grid is not worth being the reason that stops
  being true.

**Configuration**

- **Which board it talks to is compiled in, not typed in.** `electron.vite.config.ts`
  reads the repo's environment file at build time and `define`s seven values into the main
  bundle — `DATABASE_URL_APP`, `NEXT_PUBLIC_CDN_URL`, `NEXT_PUBLIC_SITE_URL` and the four
  `R2_*` — all **required**, the build throwing with the missing names rather than
  shipping an installer that reaches nothing. `DATABASE_URL_APP` and not `DATABASE_URL`,
  because those are two accounts with different powers and compiling in the read-only one
  would fail on the first upload rather than here. The site URL is optional for the
  website (Vercel supplies a fallback) and not here: it is how a shelf or an image gets
  opened on the site. `main/config.ts` reads `__BUILD_ENV__` and nothing else; only the
  main bundle gets the `define`, so no credential is compiled into a file the window loads.
- **The settings readout shows the database *host*, never its URL.** A connection string
  carries a password where the Supabase project URL it replaced carried nothing, and this
  is a screen somebody might screenshot.
- **`save.json` holds the preferences and nothing else** (`main/save-file.ts`), and the
  settings screen can **write it out and read it back** (`main/transfer.ts`). Export is a
  byte copy — it is meant to be the file. Import is section by section, so it can only
  produce a file this build could have written, and a section the file lacks is left alone
  rather than cleared. A `catalogs` section an older copy wrote is left where it is rather
  than deleted like the login and the stored keys: those were liabilities, and that one is
  the only copy of a set of names somebody gathered by hand. Plain readable text on
  purpose: it can be inspected, hand-edited and copied, and there is nothing secret left in
  it. `userData` is pinned in `main/index.ts` rather than defaulting to the app's display
  name, so renaming the app doesn't move the settings — `pubooru-desktop` packaged,
  `pubooru-desktop-dev` in a checkout, so `desktop:dev` runs from its own preferences and
  both can be open at once. A file that won't parse is treated as absent, costing the
  settings and never a crash. The two rule sections an older version wrote are deleted on
  the way past (`dropStoredRules`), the way the login and the stored keys were.
- **The website's maintenance switch is on the settings screen**, because this app is the
  only program that can reach the board to write and a switch on Vercel would be a redeploy
  to close the site and another to open it. One write moves the switch and words the notice
  together — the notice is only read while the switch is on. Three states, not two: a board
  that could not be asked is drawn as that, never as off, since off is the state that means
  visitors are being served.
- **The settings screen is a readout, a few settings and a cache.** Connection shows the
  project and board URLs, never the keys. `main/preferences.ts` applies as it writes, so a
  change takes the next image rather than the next launch. Tag cache configures nothing,
  but a cache is the one thing that can be wrong while everything else is right, so it says
  what it holds and how old it is.

**CPU manners** (`main/cpu.ts`)

libvips spreads one encode across every core, so an upload used to pin a 16-core machine
flat. Two settings bound it: `sharp.concurrency()` from `encodeThreads` (half the cores
by default) and scheduling priority from `encodePriority` (below normal by default).
Neither is `effort` — thread count, priority and compression are independent, and the
measured table there shows fewer threads coming out *smaller* (fewer aom tiles), costing
only wall time. Both are process-wide, applied before the first encode and re-applied on
save. A POSIX host won't let a niced-down process raise itself back, so low → normal
takes a restart; Windows, which this is packaged for, will.

**Views** — `App.tsx` holds `'collections' | 'artists' | 'tags' | 'settings' | 'about'`,
opening on collections, with settings forced open only for a bundle built with no project.
Nothing sits behind a session, because there is none.

- **Open site** is the header item that is not a view: it opens `/posts` in the browser
  and is never drawn active, because it goes somewhere else.
- **🗂️ Collections** and **🎨 Artists** are their own sections above.
- **Tags** keeps the board-wide vocabulary for a later use — not a shelf's tags, which are
  on the shelf: nothing carries one of these, so the grid has no
  counts, and there is no Apply by tag and no way to a tag's posts. Click a row for rename /
  recategorize / delete, **which row of the form it sits on** (a menu of every row, since a
  section is not a division of a category — recategorizing leaves the row alone), **and
  that tag's rules**. **A click on the grid means one thing**: it opens that tag. **Categories
  are folded**, a heading and its count until clicked; filtering forces every one open, with
  the fold remembered underneath, so clearing the box puts back what you had open. New tag
  asks for a name and a category and nothing else, so a new tag is on no row until it is
  filed. The category menu is `TAG_CATEGORIES` — **adding one is a line there plus a
  colour**, and no migration, since the column is free-form text. Reads don't assume the
  list (`categoryOrder` puts an unknown category after the known ones rather than dropping
  its tags); writes do (`z.enum(TAG_CATEGORIES)` on both IPC channels). Its list is cached
  in a module-level store because the view unmounts whenever something is in front of it;
  🔄 re-reads, clearing main's copy first.
- **🧱 Sections is a view, not a panel** (`form-sections.tsx`): the rows of a tag form —
  `tag_form_sections`, `tags.form_section_id` pointing at one — as **a card per row with
  its tags inside it**, and the **unfiled tags in a strip at the top**. The form those rows
  were drawn on went with the posts; the rows, their order and their conditions are kept
  with the vocabulary. **Filing is a drag** onto a card, written on the drop. **The top
  strip is not a drop target**: unfiling is a decision to make on that tag's own panel
  rather than one to reach by letting go short of a card. The **grip** reorders — an
  **insert**, into either column or the space under one, and one write carries both columns
  in their new order, since the side is stored on the row (`tag_form_sections.side`) rather
  than derived from a position's parity. **␣ Space** makes a row that holds nothing
  (`isSpacer` / `newSpacerName` in `@common/tags`, `__space__<random>`), a magic value in a
  free-text column defended the way `tags.mark` is. A row's **condition** —
  `tag_form_section_deps`, none, `any` or `all` — is answered from the same chips, and **a
  row never waits for a tag that is on it**: such a rule could never be answered, so
  `editFormSections` and `setTagFormSection` both refuse the pair, and the picking row's own
  chips are drawn faded and inert. Order is why `tag_form_sections` is a table, and **ids
  are why a row can be renamed**.
- **About** is the exception to the screen order — "what version is this" is fair to ask
  of a copy that cannot reach its board. It carries what `app:status` reports, since the
  renderer has no `process` and a packaged app ships no manifest.

**Tag rules** — two kinds, both the **board's**, and **not a screen**: they sit on the
panel of whichever tag the Tags screen has open (`tag-rule-editor.tsx`), because a rule is
written *about* a tag. **Implications** (`white_bra → bra`, and a rating floor spelled
`rating:r18` in the same list) and **recommendations** (`panties → black_panties`) are
applied and offered nowhere now that nothing is tagged; they are kept with the vocabulary.
**The right side is searched, not typed** — a name is added by picking it out of what the
box finds, so a rule can only name tags the board has. `rule-diagram.tsx` is 🗺️ Rule map,
top right of Tags, drawing every rule at once as the forest it is; read-only, because a
screen that both explains and edits invites an edit made on a picture rather than on a tag.
Both are rows on **`tag_rules`**, one table with a `kind` column (`smallint`, 0 implies and 1
recommends; `RULE_KIND` in `@common/data/rules.ts` is the only place either number is
spelled), parsed on the way in by a `normalize…` that doubles as the IPC validation, and
reaching the window through one module-level store (`renderer/src/rule-store.ts`). Rows are
tag **ids**, so a rename carries every rule that names it and a delete takes them with it;
`@common/data/rules.ts` is the only place ids and names meet. An implied **rating** cannot
be a row, so it is `tags.implied_rating`, one per tag, folded back into the implied list as
a `rating:` token on the way out.

**Tag index cache** (`main/tag-cache.ts`) — the board's tags in one `app-cache/tags.json`
for a day, serving `tags:list`. A whole vocabulary is a few hundred kilobytes, so it is read
once and held. It is dropped by any write that changes a tag row, by the settings screen's
Clear cache and by the Tags screen's 🔄. A failed refill keeps serving the stale copy rather
than nothing. It was one file per board while a tag carried a count per board; startup
deletes the old per-board and browse files on the way past.

**The cache folder** (`main/app-cache.ts`) — `app-cache/` in `userData`, holding
`tags.json`, `collections.json`, `thumbs/` and `images/`. Everything in it is a copy of what the board already has, so the
folder can be deleted at any moment and the only cost is the next read — which is the line
between it and `save.json`, where losing a file loses something.

**Images** (`main/image-cache.ts`) — `app-cache/thumbs/<file_name>.avif` and
`app-cache/images/<file_name>.<ext>`, the stored files byte-for-byte; the shelves and the
artist list draw their thumbnails from it (`cachedThumbnail`), and both full-size viewers
their pictures (`cachedImage`). **Nothing expires and nothing is invalidated**: the name is
the md5 of the bytes, so a file found under it *is* that image. That is also why it is a
folder of bytes rather than base64 in JSON, which would be a third bigger and rewritten
whole every time one arrived. **Only the thumbnails are also held in memory** — one is a few
kilobytes and a grid asks for the same ones over and over, where a full size is whole
megabytes as base64 asked for by one click at a time. Deleting an image sweeps up both of
its files (`forgetImage`), the only name that can ever stop meaning an image.

**The shelves** (`main/collection-cache.ts`) — the shelf list in `app-cache/collections.json`
for a day, and each screenful of one shelf's images in memory for the session. What is being
cached is the round trip, not the rows: every glance at Settings unmounts the Collections
screen and paid for the list again on the way back. Two lifetimes because the two go stale
differently — the list is small and complete, so it survives a restart and 🔄 Refresh forces
past it; a shelf's images are pages cut at a cursor, right only until something lands on
that shelf. **Every write drops all of it** (`dropping` in `main/collections.ts`, so it is
not a line to forget), since a shelf's `updated_at` moves whenever an image is added,
removed or moved and no write's effect is confined to one cached answer.

**DNS** (`main/dns.ts`) — it resolves like a browser, not like the host. Every open-web
fetch it makes is an address dragged out of a browser, and a browser on DoH will happily
show an image the machine's own resolver answers NXDOMAIN for. `configureHostResolver`
names Google and Cloudflare in `secure` mode; `automatic` only upgrades when the
*system's* provider speaks DoH, which is never true on the networks this is for. It
reaches only Chromium's stack (the drag downloads) — the database goes over a socket and
the bucket over Node's `fetch`, both on the OS resolver, which is what makes a DoH-only
setting safe.

**Version** — `packages/desktop/package.json`, raised by every change under
`packages/desktop`. It is read at runtime by `app.getVersion()` rather than compiled in,
because that is the number electron-builder actually stamped on the copy being run, and
About draws it.

There is no changelog. A file per release described a cadence this app does not have —
the version moves whenever the app does — and the reasoning those notes carried is better
placed in the commit and beside the code, where it already was.

## Database

Full reference: [docs/database-schema.md](docs/database-schema.md).

- **Never run `db:push` or any other migration command.** Write the migration
  file and say it is pending; applying it is the author's, on the author's board. An agent
  that pushes has changed a live database on a hunch about what the author wanted, and the
  file is the part that can be reviewed before that happens.
- **One baseline**, `db/migrations/0001_baseline.sql`: every table in foreign-key order
  and its indexes, plus `0002_site_settings.sql`, `0003_sections_off_categories.sql`,
  `0004_section_sides.sql`, `0005_generative_posts.sql`, `0006_collections.sql`,
  `0007_artists.sql`, `0008_artist_ai.sql`, `0009_artist_archive.sql`,
  `0010_artist_favorites.sql`, `0011_collection_rating_mark.sql`,
  `0012_collections_only.sql` — dropping both boards' tables, their link tables and the tag
  count columns, and leaving the tag vocabulary in place — and `0013_collection_tags.sql`,
  a shelf's own tags. Schema changes from
  here are **always** a new numbered file, never a dashboard edit and never an edit to the
  baseline once pushed anywhere real. `scripts/migrate.mjs` applies each inside a
  transaction and records it in `_migrations`.
- **`db/grants.sql` is not a migration** and re-runs on every `db:push`. Who may do what
  is desired state, not history: roles are made after the schema exists and remade when a
  password changes, and a grant block inside the baseline ran once, before either.
- **There is no `db:reset` and no seed.** Reset was `drop schema public cascade` behind
  one word — the whole board, with the images left in R2 as orphans nothing could name —
  and it was worth having only while the schema moved under a board with nothing on it.
  Rebuilding from nothing is rare enough to type out in a console, where the statement is
  visible. The seed went earlier and separately: a starter vocabulary is a guess about a
  board somebody else is making. An image could never have been seeded anyway — its row is
  half of a pair, the other half being two objects named after the md5 of bytes no SQL
  file has.
- **No SQL functions and no triggers.** The writes, the view counter and `touchCollection`
  are TypeScript — a plpgsql body needs a migration to edit and reports one opaque error
  from inside a statement that was about something else. Don't add RPCs back without a
  reason plain SQL genuinely can't meet.
- **No denormalized counters.** A shelf's image count is a `count(p.id)::int` in the read
  that draws it, the cover an `array_agg` over the same group. `view_count` increments,
  which is fine: a view is derived from nothing, so the increment *is* the record.
- **`site_settings` is a name and a string, and the only table that is not about the
  board's contents.** `key text`, `value text`, `updated_at` — so the next site-wide switch
  is an insert rather than a migration, and a row is something the board's owner can read
  and change by hand in a console, which is why it is neither a column per setting nor
  JSON. A setting with two parts is two rows: `maintenance` (`'on'` closes the site) and
  `maintenance_message`. The meaning lives in `@common/data/site.ts`, one reader and one
  default per key — an absent, older or hand-typed value costs the default and never a
  throw — and reading is loose where writing is strict, the bargain `asRating` makes.
  `booru_web` may select; `booru_app` may select, insert and update — not delete.
- **`tags.mark` is one slot holding two kinds of thing.** A `#hex` or a CSS colour name
  is drawn as a dot, anything else as text, and `markColor` (`@common/tags`) is the only
  place that decides which. It replaced a guess: the desktop used to paint a dot on any
  name starting with a colour word from a list in code, which read `golden_retriever` as
  gold and could not be overridden. `readTagMark` is what may be written; `''` clears it.
  A shelf's mark (`collections.mark`) is a different, freer thing — see
  [Collections](#collections).
- **No RLS. Three roles** — `booru_owner` (migrations only), `booru_app` (the desktop,
  writes everything, owns nothing), `booru_web` (Vercel, reads everything but the artist
  tables, plus `update (view_count) on collection_posts`). **Create them with SQL, never in
  Neon's console:** a console-made role gets `neon_superuser` plus
  CREATEDB/CREATEROLE/BYPASSRLS, which overrides every grant, and the owner cannot revoke
  it — the only repair is to drop the role and remake it.

## Ratings

- **Two tiers, `g` and `r` — General and R-18.** It was Danbooru's four, and the middle
  two were a judgement nobody made the same way twice while the board did nothing with
  either answer but decide whether an image sits behind the setting. That is one bit, so it
  is one bit. A letter rather than a boolean because a third tier (pixiv has R-18G) should
  stay a code change.
- **A rating is a shelf's** (`collections.rating`), and every image on it takes it. An
  image's own column was dropped as it stood (0012), without raising any shelf first.
- **Stored as one letter, written as a word.** That is `RATINGS`, and what `Rating` means
  everywhere in the code. A URL spells it out (`/collections?rating=r18`), as does a tag
  rule's floor (`rating:r18`); `RATING_NAME` is the only translation; `RATING_LABEL` is the
  third form and the only one a person reads.
- **Reading is loose, writing is strict.** `asRating` accepts `rating:r18` *and*
  `rating:r`, because someone who has seen the column will type the letter.
  `ratingToken` and `collectionsHref` only ever write the name.
- **`RESTRICTED_RATINGS` (`r`) gates three things.** A restricted shelf stays out of
  `sitemap.xml` and is `noindex`ed; the shelf list and both feeds leave it out until the
  NSFW cookie is set; and its own page and every image page on it render
  `<RestrictedNotice />` instead — a URL is reachable without going near a listing, which
  is what a link, a bookmark or a private window is. The **metadata is gated too**, since
  nothing fetching an unfurl carries the cookie. Still not access control — the cookie is a
  checkbox anyone can tick, and there are no accounts to attach an age to.
- **A ceiling the filter narrows within, never lifts.** Every read takes the visible set
  (both tiers when omitted, which is what the desktop app gets), and the shelf list's
  `?rating=` intersects with it — so R-18 asked for with NSFW off honestly returns nothing
  rather than reaching past the setting, and the page says why.
- The column is free-form text with no check constraint, so a new tier is a code change
  only.

## Images

- **One R2 bucket, a pair of prefixes per kind** — `collections/posts/` and
  `collections/thumbs/` for the shelves (`@common/collections`), `artists/images/` and
  `artists/thumbs/` for the artist list (`@common/artists`). Paths derive from `file_name`
  (the md5 of the uploaded bytes), never stored. The boards' `posts/`, `thumbs/` and
  `generative/…` objects are orphans after 0012, which could reach the database and not
  the bucket. It was two buckets once, which is two public hostnames for two halves of the
  same thing; a prefix costs nothing. Objects are written with `Cache-Control: immutable`
  for a year, which is free correctness given the name *is* the content hash.
- **Both encoders are lossy AVIF** (`@common/imgcmp/`). The thumbnail is 384px tall,
  width capped at 768 for panoramas, `mitchell` kernel, always quality 50 — the web grid
  scales by row height, so height is the bound that matters, and `THUMB_MAX_HEIGHT` and
  that grid's `MAX_ROW × --row-h` (`image-rows.tsx`) are one decision and must move
  together. The stored image is kept only when it beats the uploaded bytes, otherwise the
  original is stored byte-for-byte. Lossless was measured and rejected on size (3.6MB from
  a 1.9MB JPEG).
- **The stored image's quality is a ramp on its longer side** (`postQualityFor`): 50 at
  1920px and above, rising in a straight line to 75 at 1280px and below — 1600px is 63,
  1440px is 69. Quality 50 is the right trade for something the resize is already taking
  detail from and the wrong one for an image that arrives at the size it will be looked at
  — nothing is thrown away, so every artefact is seen at 1:1, and there are far fewer
  pixels to pay for. A ramp rather than steps because the argument strengthens gradually
  and steps put a cliff between two uploads a pixel apart. Landscape, portrait and square
  all reduce to `Math.max(width, height)`, which is what the code says; unreadable
  dimensions take the floor, not the ceiling. Nothing above the floor can bloat an image:
  the only path that keeps the AVIF without comparing it to the uploaded bytes is an image
  over `POST_MAX_DIMENSION`, which is over 1920 and so on the floor.
- **The stored image is bounded to 2560 on both sides** (`POST_MAX_DIMENSION`).
  Above it the AVIF is not competing on bytes — it is the only version inside the cap, so
  it is kept however it measures, and the row records the *stored* size, not the uploaded
  one. An animation is the one thing that can still exceed it: the encoder declines rather
  than flatten it to frame 1.
- **MD5 is the dedup key on purpose** — collision resistance is not what it's for.
- `view_count` is bumped only by `recordCollectionPostView` from the browser, never on a
  read path, so prefetches, `generateMetadata` and crawlers don't inflate it.

## Style

- **A file stays under 400 lines.** Past that, look for the seam and take the part that
  has one across to a file of its own — a panel out of a screen, a group of handlers out
  of `ipc.ts`, a stage out of the pipeline. It is a limit on how much has to be held in
  the head at once, not a formatting rule, so a file at 410 that says one thing is better
  left alone than cut at 399 in the middle of it.
- **Two named exports a file, as a rule of thumb.** A third is the sign that a module has
  started answering two questions, and the fix is usually the same seam the line count
  points at. The exception is a module that exists precisely to be the one place a
  vocabulary is spelled — `@common/search`, `@common/tags`, `@common/collections`,
  `@common/artists`, `shared/api.ts`, `components/buttons.ts` — where splitting is what
  invariants 8 and 10 are there to prevent. Those are named, and the list is short on
  purpose: a new file with five exports is not one of them.
- Prettier (`.prettierrc`): no semicolons, single quotes, 100 cols, 2 spaces. Run
  nothing — match the surrounding file.
- Comments explain *why*, in prose, and are common here — the measured trade-off, the
  failure that motivated the choice. Match that register; don't narrate what the code
  already says.
- No component library. Plain Tailwind against the CSS variables in `globals.css`
  (`background`, `surface`, `border`, `muted`, `accent`). Dark theme only.
- **A button is an emoji, its words, and no box.** `renderer/src/components/buttons.ts`
  is the only place that spells one, and a new control takes a constant from there rather
  than a class list of its own. No border and no ground at rest; **hover adds a ground and
  lifts the text** to `foreground`, together — that ground is the hit area appearing under
  the pointer, which is what the border was drawing all along and only ever needed to draw
  while you were pointing at it. It replaced an underline on hover, which said "link", and
  these are not links: they unfold panels, upload images, delete tags.
  - The ground must be a step from whatever the button sits on, so there are two:
    `BUTTON` / `BUTTON_SM` (`hover:bg-surface`) for the page, `BUTTON_ON_SURFACE`
    (`hover:bg-background`) inside a panel or a bordered row. Two `hover:bg-*` utilities
    in one class list is a coin toss decided by stylesheet order, which is why they are
    separate constants and why `buttonToggle(active)` swaps the colour into the shape
    instead of appending one.
  - `buttonToggle` is accent while what it opened is open — the whole of what an outline
    used to say. `BUTTON_SUBMIT` is accent always, for the control that finishes a form.
  - **A control with two positions is a pair of segments in a track**, not two buttons:
    `SEGMENTS` and `segment(active)` — the Artists screen's non-AI / AI and the Sections
    screen's 🧾 Detailed / 📋 Compact. Two `buttonToggle`s leave the only difference between
    "Compact is on" and "Compact would turn on" as one word in accent — a state you had to
    already know to read. A border around both says they are one control before either
    label is; the filled one is where you are.
  - **The exception is text that genuinely is a link** — a URL or an image number in a
    line of prose, in About, Settings and a shelf. Those stay `text-accent
    hover:underline`, because they go somewhere and a person should know that before
    clicking.
- **A placeholder is an example, not a description.** `blue_hair`, not "filter tags";
  `Ukiyo-e studies`, not "collection name". The label and the heading already say what a
  box is for, and a box saying it a third time teaches nothing — an example shows the
  spelling, the separator and the grammar at once.
- **Prefer an emoji to a drawn icon**, and pick a fancy one where a fancy one fits — 🔄,
  ➕, 🧩, 📋, ✅, 🗑️, 🖼️. They cost no SVG, no component and no import, they carry colour
  the palette otherwise has none of, and a control that is one glyph beside its own words
  is read faster than a line drawing. Always `aria-hidden` with the real label in text or
  in `aria-label` — an emoji is decoration, and a screen reader announcing "package" for
  Import is worse than silence.
  The exception is a control drawn *only* as a glyph and repeated down a list, where a
  stroked icon at a known size is steadier than a font the OS chooses. The desktop app has
  none left since the upload form's bin went; if a new control is not one of those, it is
  an emoji.
- Mobile-first: design at 375px, scale up with `sm:`/`md:`/`lg:`. 44px tap targets.

## History

Everything here is gone. Recorded so a change is not proposed twice; none of it is
current.

| removed | why |
|---|---|
| Supabase Auth, `profiles`, `handle_new_user()`, `src/proxy.ts`, the cookie-carrying and browser clients | Every account was one person's, nothing displayed who uploaded what, and the desktop bundle already carried the service-role key — the login guarded a door it was not the lock for |
| `posts.uploader_id`, all write RLS policies | Went with the accounts |
| `/upload`, `/login`, `/account`, `/tags/manage`, `src/lib/upload-limits.ts` | Uploading was already the desktop app's job; the rest went with the accounts |
| The `(supabase, admin)` two-client parameter | With no session, a write is a write |
| `rating_counts` and its three triggers | A table, a policy and a recount per write, for a number beside four fixed filters |
| `search_posts`, `create_post_with_tags`, `update_post_with_tags`, `increment_post_view` | plpgsql is hard to edit and reports opaquely |
| `docs/future.md` | A roadmap that had to be kept in step with a build that outgrew it |
| The `@web` alias into the website's `src/` | Made the site's internal layout part of the desktop build; where a file sits answers "is this shared?" now |
| `ensureTagIds` — the `on conflict do nothing` upsert every post write ran | Coined a tag from a typo, in an app where naming one is the Tags screen's job; and Postgres draws the identity default before it tests the conflict, so every tag a post already had spent a `tags.id` on every save |
| The `implications` and `recommendations` sections of `save.json` | Keyed by name, so a rule died silently when the tag it named was renamed or deleted, and the rules were one machine's — `tag_rules` is keyed by id |
| **Tag catalogs** — `shared/catalogs.ts`, `main/catalogs.ts`, `renderer/src/catalogs.ts`, `tag-catalogs.tsx`, the grid's picking mode, the 📚 Catalogs menu and the `catalogs` section of `save.json` | A third answer to "what else goes on this post?", beside two that answer it without being asked, picked by name — a way of working rather than a fact about a tag, and so one machine's, unbacked and invisible to the board |
| `packages/desktop/changelog/` | A file per release, for a cadence this app does not have; the reasoning belongs in the commit and beside the code |
| `packages/desktop/build-id` | A second number saying what `package.json`'s version already said, and the version has the advantage of being what electron-builder stamped on the copy actually running |
| The upload **queue** — `upload-queue.tsx`, the reorder arrows, the per-card fold, the done tick, the Apply-to-all bar | Machinery for keeping twenty half-tagged images straight. Tagging is per image however they are stacked, so the queue postponed the slow part rather than removing it |
| `tags.category2` and everything spelling it — `Subcategory`, `setTagSubcategory`, `tags:set-category2` | A heading *inside* one picker: it could divide a category and never shorten one. What divides the vocabulary for a form now is `tag_form_sections` |
| **Form groups** — `tag_rules` kind 2, `shared/groups.ts`, `renderer/src/groups.ts`, the Form group panel | A group hid tags *inside* a row, so the row was still drawn with a ＋ that opened onto a picker empty for reasons it could not state. `tag_form_section_deps` says it about the whole row instead |
| **The form's category headings** — `tag_form_sections.category`, `RIGHT_COLUMN` | A section inside a category asked the question twice, and forbade the one thing a form row is for — `bikini` is General and `bare shoulders` is Appearance, and both belong on the row you fill in looking at a swimsuit |
| The hardcoded Character↔copyright match (`LINKED_CATEGORY` / `LINKING_CATEGORY` / `OTHER_SECTION`) | One dependency, in `any` mode, spelled in code for one pair of categories |
| **Supabase entirely** — PostgREST, RLS, both Storage buckets, the CLI, `@supabase/supabase-js`, `src/lib/supabase/`, `supabase/config.toml` | Postgres on Neon and a bucket on R2. Multi-tag AND is the one thing PostgREST cannot express; RLS went with the anon key, and a `grant` says what a select-only policy was standing in for |
| `@supabase/supabase-js`'s query builder — 62 call sites, every embed, `maybeSingle()`, `count: 'exact'`, `.range()` paging | Plain SQL through `postgres` (porsager). The view counter went back to `+ 1` and the writes became real transactions |
| The **four-tier rating scale** (`g`/`s`/`q`/`e`) | Two tiers, General and R-18. The middle two were a judgement nobody made the same way twice |
| The unwind in `createPostWithTags` | A transaction. An unwind is itself a write that can fail, which is the case it could do nothing about |
| `src/lib/env.ts`, `next.config.ts`'s `images.remotePatterns` | The first became `isDatabaseConfigured()` beside the pool; the second allow-listed a host for an optimizer nothing has used since both images went `unoptimized` |
| **The two boards** — `posts`, `generative_posts`, `post_tags`, `generative_post_tags`, `tags.post_count`, `tags.generative_post_count` (0012); `@common/board`, `@common/data/posts`, `@common/data/search`, `@common/data/counters`, `syncTagPostCounts`, `createPostWithTags` / `updatePostWithTags`, `createPostFromImage` | Every post and AI post was moved onto a shelf, so the tables held nothing anybody read. The vocabulary stayed; the link tables and counts that tied it to posts did not |
| **The tag search** — the `?query=` grammar, `searchHref` / `postHref`, `/posts/[id]`, `/ai-posts` and `/ai-posts/[id]`, `/tags` and `/tags/[id]`, the search bar, the tag drawer, facets, saved queries (`lib/saved-queries.ts`) | Nothing carries a tag to search for. Images are found by shelf now, and the shelf list has a search of its own |
| The **🤖 AI posts cookie** (`lib/generative.ts`, `generative-server.ts`, the settings checkbox) | There is no second gallery to volunteer. A generated shelf is `collections.is_ai`, one filter on the shelf list |
| `lib/request-log.ts` and `LOG_READS` | A diagnostic line per read, naming which kind of request ran it; meant to come out once the traffic had a name, and the reads it watched went with the boards |
| **Desktop Upload, Browse, the post editor and the board switch** — `upload-form.tsx`, `browse*.tsx`, `post-editor.tsx`, `board-store.ts`, `ipc-posts.ts`, `manage.ts`, `browse-cache.ts`, the image viewer and the rating guide | Everything about a post. Shelves take images as a batch from 🗂️ Collections, and the thumbnail cache moved to what is now `image-cache.ts` |
| `CategoryTagField`, the tag picker, `tag-seed.ts`, tag import and **Apply by tag**, `bumpTagCounts`, `tags:suggest` | The one tag editor, and the machinery around it, with no post left to tag. The vocabulary and its sections are kept; the field that filled them in is not |
| `main/close-guard.ts` | It asked before closing a window whose upload screen held hand-typed tags or a just-made post number, and went with that screen |
| `collection_posts.rating` (0012) | An image's tier is its shelf's (`collections.rating`, 0011): a shelf of adult work was still a card with a name on it, and the name alone can say plenty |
| `scripts/to-collection.mjs` and `npm run posts:to-collection` | It moved posts onto shelves, and every post has been moved |

The rating scale has now been rewritten four times and never once needed a migration,
which is the whole argument for that column being free-form text: `general, e1..e5` →
four names → the letters → the two tiers. `posts.md5` → `posts.file_name` went the same
way.

**The board was emptied for the move to Neon**, and the posts re-uploaded by hand rather
than migrated: the vocabulary a set of images deserves is not the one they were first
tagged under, and re-tagging is the work either way. That is what made the schema squash,
the id columns narrowing to `integer` and the rating collapse free. The posts were later
moved onto shelves, tags dropped for good, and the boards' tables with them.

There are no accounts and no role tier: anyone with a build of the desktop app can do
everything, everyone else can read. Public accounts would mean an auth system, a
`profiles` table and a role that may write behind it; git has the shape of all three.

## Docs

[docs/architecture.md](docs/architecture.md) and
[docs/database-schema.md](docs/database-schema.md), plus `design/` (one screenshot of the
interface as drawn). Each package has a README of its own. There is no roadmap, no status
page and no runbook: a live project needs the environment file and `npm run db:push`, and
the reasoning behind a decision lives in this file and beside the code it explains.

Docs lag the build. When they disagree with `src/` or `db/migrations/`, the code
wins — and fix the line you tripped over.
