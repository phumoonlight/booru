@AGENTS.md

# Pubooru

A booru-style image board (Danbooru is the reference): tag-centric gallery, multi-tag
search with negation, post detail pages. Next.js 16 App Router, Neon Postgres,
Cloudflare R2, Tailwind v4, mobile-first.

**The website is read-only and has no accounts.** Everything that changes the board —
uploading, editing, deleting, the tag vocabulary — happens in the desktop app, which
writes with a Postgres login and a bucket key compiled into its own bundle. Most of the
shape below follows from that one fact.

| | | |
|---|---|---|
| `src/` | the website | Next.js on Vercel. Renders the gallery; reads only |
| `packages/desktop` | the Electron app | Uploads, edits, deletes, manages tags |
| `packages/common` | `@common/*` | What both compile: post shape, search grammar, write path, encoders |

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
structure further down.

1. **Never query the database from a page or component.** Reads go RSC →
   `src/lib/data/*` → `@common/data/*`.
2. **Never add a write to `src/`.** `booru_web` may `select` everywhere and `update
   (view_count) on posts`, and holds no other write grant — so the database refuses one
   rather than a reviewer having to. Mutations belong in `packages/desktop`.
3. **Nothing in `packages/common` builds a client** — the caller passes a `Db`, and the
   upload also takes an `ObjectStore`. `src/lib/db.ts` is `server-only` and reads the
   environment, so a module that built its own could not run in Electron.
4. **Nothing in `packages/common` imports `next/*`, `server-only` or React**, reads the
   environment, or hardcodes a limit. Electron's main process compiles these files.
5. **Every write that moves tags must call `syncTagPostCounts`** with the tags it moved
   **and the board it moved them on**. No trigger does it any more, and the count column
   and the link table it recounts from both come out of `@common/board`.
6. **`createPostWithTags()` and `updatePostWithTags()` take the pool, not a `Db`** —
   they are the only two that open a transaction, which is what replaced the hand-written
   unwind. Everything else takes `Db` (postgres.js's `ISql`) so it can also be called
   *inside* one.
7. **No write path coins a tag.** `resolveTagIds` (`@common/data/shared`) reads the names
   it is given and throws naming the ones the board has no row for, so creating a post,
   editing one and Apply by tag all fail on a name that isn't a tag yet. Creating one is
   ➕ New tag on the desktop Tags screen and nothing else. This is a correctness fix as
   well as a UI one: the old `on conflict do nothing` upsert made Postgres draw the
   identity default before testing the conflict, so every tag a post already had spent a
   `tags.id` on every save.
8. **A Tailwind class in `packages/common` needs an `@source` line** in
   `packages/desktop/src/renderer/src/styles.css`, or it compiles to nothing in the
   desktop build. Currently the category colours behind `categoryColor` (`@common/tags`),
   its plain-foreground fallback included, and `RATING_COLOR` (`@common/search`). The failure can be *partial*, where a hex shared with another
   scanned constant happens to survive.
   The same shape of trap one language down: **an SQL comment inside a tagged template is
   still inside a JavaScript string**, so a backtick in one ends the query and TypeScript
   reports the parse error somewhere else entirely. The queries in `@common/data/*` keep
   their commentary above the template.
9. **`searchHref()` is the only thing that spells the listing's path**, and
   `postHref()` the only thing that spells a post's. Tag links, facets and the feed
   derive from the first; the grid's cards and the detail page's arrows from the second,
   which is what carries `?query=` from the listing onto the post and back out again.
   **Both take a board** and read the path out of `@common/board` — a second pair of
   functions for `/ai-posts` would be this grammar written twice.
10. **A table name is never spelled in a query** — `@common/board` holds the three per
   board (`posts`, `post_tags`, the count column) and every read and write takes a `Board`
   and interpolates them with `db(...)`, as identifiers. That is what makes the two boards
   impossible to mix by accident, which is the whole reason `generative_posts` is a table
   rather than a `generated boolean`. A board that arrives from the browser — an action's
   argument — is checked with `isBoard` before it names anything.
11. **Re-measure with `npm run bench:avif` before changing a constant in
   `@common/imgcmp/`.** Those numbers were measured, not chosen.
12. **`select count(*)` needs `::int`.** postgres.js hands a `bigint` back as a *string*,
    to avoid silently losing precision. That is also why `posts.id` and `tags.id` are
    `integer` rather than `bigint` — see the baseline migration's note.
13. **Every change under `packages/desktop` raises the version in
    `packages/desktop/package.json`.** About reads it (`app.getVersion()`) and
    electron-builder stamps it on the installer, so a build that was not bumped is
    indistinguishable from the one before it — on screen and on disk alike.

## Layering

- **Reads:** RSC → `src/lib/data/*` → `@common/data/*` → the pool. The one read that
  isn't an RSC is `loadMorePosts` in `lib/actions/search.ts` — the feed's next chunk, an
  action rather than a route handler so the data layer stays the only query surface.
- **The website's only write is `recordPostView`**, because a visitor's view still counts.
  It is `update <the board's table> set view_count = view_count + 1` — atomic again, where PostgREST
  forced a three-attempt compare-and-swap that dropped the view under contention.
- **One pool, `src/lib/db.ts`**, `server-only`, connecting as `booru_web`. It was two
  clients — an anon one for reads and a service-role one that could bypass every policy
  in the project, held solely to count views. A column grant says that better.
- **Query logic lives in `lib/data/` and `@common/data/`**, never in actions or pages, so
  a second caller can reuse it — which is how the desktop app browses the board.
- **Pure helpers** (`@common/search`, `@common/tags`, `@common/storage`, the web's
  `config.ts` and `lib/images.ts`) import nothing server-side, so client components can
  share them.
- **`src/config.ts` is the website's only `process.env`.** The name (`SITE_NAME`, from
  `NEXT_PUBLIC_SITE_NAME`, defaulting to `Booru`), the origin, the image host and the
  connection string are read there and nowhere else, so a misconfigured deployment is
  one file to read. It is not `server-only` — the name is drawn by client components —
  which is safe because Next inlines `NEXT_PUBLIC_*` and nothing else.

## `packages/common`

The post write path, the search, the counters, both encoders, and the pure helpers. See
[packages/common/README.md](packages/common/README.md).

- **`@common/*` is a tsconfig `paths` mapping** to `packages/common/src`. No build step,
  nothing published; files in there import each other by `@common/…` too, so a module
  reads the same wherever it is compiled. The web gets the mapping from the root
  `tsconfig.json`; the desktop needs it twice — `packages/desktop/tsconfig.json` for the
  type checker and a Vite alias in `electron.vite.config.ts` for the bundler.
- **The handle is an argument, never a construction.** `@common/data/*` takes a `Db`;
  `@common/upload/pipeline` takes a `Db` and an `ObjectStore`. Don't simplify either
  parameter away — that is what lets the same files compile in a server render and in
  Electron's main process.

## The website (`src/`)

- **Ten routes**, and none of them writes: `/`, `/posts`, `/posts/[id]`, `/ai-posts`,
  `/ai-posts/[id]`, `/tags`, `/tags/[id]`, `/settings`, `robots.txt`, `sitemap.xml`. There
  is no `/upload`, `/login`, `/account`, `/tags/manage` or `src/proxy.ts` (Next 16's
  `middleware.ts`) — see [History](#history).
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
  treated as serving: a blip must not close the site.
- **The gallery is `/posts`, not `/`.** `/` is a landing page: wordmark, search box,
  emoji post count. `/?query=` redirects to the listing for old links.
- **There are two boards, and they are one page twice.** `/ai-posts` is the generated
  images — a separate table (`generative_posts`), a separate link table into the *same*
  `tags`, a separate count column on it, and its own folder in the same bucket. What it is
  not is a separate set of files: `PostListing` and `PostDetail` are the listing and the
  post page, and each route is four lines that read a query and name a board. Two copies
  was the alternative and is how the second one stops getting the fix the first one got.
  The board itself is `@common/board` — six strings per board, spelled nowhere else — and
  every read, write, path and href takes one, defaulting to `'post'`, so nothing written
  before the second board existed changed meaning. **The vocabulary is shared and the
  counts are not**: `blue_hair` means one thing across the site, and a tag on four hundred
  generated images and two drawings is not a tag with four hundred and two posts on either
  gallery.
- **🤖 AI posts is behind a cookie, and only the nav item is.** `lib/generative.ts` holds
  the spelling and `lib/generative-server.ts` reads it, split for the reason the NSFW pair
  is. Switched off, the item is not drawn and `/ai-posts` is still reachable — like a
  post's own URL, this is what the site volunteers rather than a gate. The whole board is
  `noindex` and out of `sitemap.xml`: a section a visitor has to switch on is not one to
  arrive at from a search engine. Its settings control is a **plain checkbox**, beside the
  pot rather than inside it — the pot exists because what NSFW changes is hard to say in a
  sentence, and "there is a second gallery" is not.
- **`?query=` is the only param the listing has** (`SEARCH_PARAM` in `@common/search`),
  space-separated, `-tag` excludes. Ratings and the cursor ride in the same string as
  `rating:r18` and `start:900` metatags — nothing outside `splitQuery` and
  `resolveRatings` needs to know they exist, and the search bar renders each as a
  clearable chip. A saved query is therefore just that string.
- **The listing is a feed with no page numbers.** `PostFeed` renders the server's
  screenful, then appends chunks by cursor (`id < lastId`), never by offset, which slides
  when an upload lands mid-scroll. Three things are load-bearing: "load more" is a real
  `<a href="?query=… start:N">` with its click intercepted, so crawlers and a browser
  without JS can still reach past the first chunk; each chunk keeps its own `<ul>` so a
  landing chunk can't reflow rows already scrolled past; and `replaceState` keeps the
  cursor in the URL so a refresh doesn't drop you at the top. Cards open in a **new tab**
  for the same reason. `hasMore` is one row read past the chunk — nothing counts.
- **A post is read inside a search.** A card opens `/posts/<id>?query=…`, and the detail
  page spends that string three ways: prev/next walks the posts *that search* matches
  (`searchNeighbours`, which replaced the board-wide `getPostNeighbours`), the wordmark
  goes back to that listing rather than the whole gallery, and the sidebar's search box —
  the listing's own `SearchBar`, on the page a search leads to — opens holding it. The
  walk takes the visible tiers too, so with the adult ones off an arrow can no longer
  land on the notice saying they are off. `start:` is ignored there: it says where the
  listing began, which is a scrolling position rather than a wall.
- **`/tags/[id]` is a sample, not a listing** — ten posts, up to fifty, then a link into
  the gallery. No search box, no facets, no cursor: browsing a tag to its end is what
  `/posts?query=<tag>` is for.
- **Nothing goes through the Next optimizer.** Both the grid thumb and the detail image
  are `unoptimized`, so the stored file is served untouched — animation intact, no second
  lossy pass. The grid used to be optimized and visibly softened thumbnails: Next scales
  the requested quality by 50/80 for AVIF, so the default 75 became quality 47 at effort
  3, for a resize its optimizer could not perform anyway (`withoutEnlargement`).
- **The adult tiers are off by default, behind one cookie.** `/settings` is the site's
  only preferences page, and NSFW and 🤖 AI posts are the two settings on it; `lib/nsfw.ts` holds the
  cookie's spelling and `lib/nsfw-server.ts` reads it, split because the checkbox that
  writes it is a client component and `next/headers` anywhere in that import graph is a
  build error. `lib/data/search.ts` applies it to *every* listing the site renders, so a
  page cannot forget and the feed's later chunks cannot disagree with its first.
  It replaced a CSS blur — an attribute on `<html>` set before first paint — which sent
  every post and obscured some of them client-side.
- **Saved queries are `localStorage`**, so they need no account (`lib/saved-queries.ts`,
  module store in `use-saved-queries.ts` — the sidebar renders twice and both copies must
  agree). **One shelf per board**, since a saved query is a listing's whole address and the
  two listings are two addresses; the gallery keeps the unsuffixed key it always had. A row's identity is its tags, the query minus `start:`, which is what lets 💾
  move a saved cursor without a second row or any selection state.
- Pages fall back to `<SetupNotice />` when `isDatabaseConfigured()` is false, so the app
  is browsable before the environment file has been filled in.
- **Image URLs are the web's own** (`lib/images.ts`), built from `NEXT_PUBLIC_CDN_URL` and
  `@common/storage`'s path builders. The base used to be read inside the shared module,
  which broke invariant 4 quietly and made the desktop app set a `NEXT_PUBLIC_*` variable
  on itself at startup to satisfy it.

## The desktop app (`packages/desktop`)

The upload page as a desktop app, because compression is CPU work a free serverless tier
is bad at — see [packages/desktop/README.md](packages/desktop/README.md). It imports
`packages/common` and reaches into `src/` not at all.

**Process split**

- The renderer has no keys, no Node and no network. Every capability is one
  `ipcMain.handle` in `src/main/ipc.ts`; the file's bytes are read on the main side.
- **Two handles, both compiled in.** `main/db.ts` is the board's pool as `booru_app` —
  reads and writes every row, owns nothing, so a string extracted from a bundle can
  vandalise the data and cannot drop a table. `main/r2.ts` is the bucket, and the only
  implementation of `ObjectStore`. Neither signs in to anything.
- **Its limits are its own** (`main/limits.ts`, 50MB / 100MP) and now the only ones.
- Renderer CSP is `img-src 'self' data:`. Browse's thumbnails cross the bridge as `data:`
  URLs rather than being fetched by the page — a grid is not worth being the reason that
  stops being true. `main/manage.ts` caches them by file name, which can never go stale.

**Configuration**

- **Which board it talks to is compiled in, not typed in.** `electron.vite.config.ts`
  reads the repo's environment file at build time and `define`s seven values into the main
  bundle — `DATABASE_URL_APP`, `NEXT_PUBLIC_CDN_URL`, `NEXT_PUBLIC_SITE_URL` and the four
  `R2_*` — all **required**, the build throwing with the missing names rather than
  shipping an installer that reaches nothing. `DATABASE_URL_APP` and not `DATABASE_URL`,
  because those are two accounts with different powers and compiling in the read-only one
  would fail on the first upload rather than here. The site URL is optional for the
  website (Vercel supplies a fallback) and not here: it is how a finished post gets
  opened. `main/config.ts` reads `__BUILD_ENV__` and nothing else; only the main bundle
  gets the `define`, so no credential is compiled into a file the window loads.
- **The settings readout shows the database *host*, never its URL.** A connection string
  carries a password where the Supabase project URL it replaced carried nothing, and this
  is a screen somebody might screenshot.
- **`save.json` holds preferences and the tag catalogs, and nothing else**
  (`main/save-file.ts`), and the settings screen can **write it out and read it back**
  (`main/transfer.ts`). Export is a byte copy — it is meant to be the file. Import is
  section by section through the same `normalize…` the IPC channels use, so it can only
  produce a file this build could have written, and a section the file lacks is left alone
  rather than cleared — and the tag rules are no longer among the sections it carries.
  Plain readable text on purpose: it can be inspected, hand-edited
  and copied, and there is nothing secret left in it. `userData` is pinned in
  `main/index.ts` rather than defaulting to the app's display name, so renaming the app
  doesn't move the settings — `pubooru-desktop` packaged, `pubooru-desktop-dev` in a
  checkout, so `desktop:dev` runs from its own preferences and both can be open at once. A
  file that won't parse is treated as absent, costing the settings and never a crash. The
  two rule sections an older version wrote are deleted on the way past
  (`dropStoredRules`), the way the login and the stored keys were.
- **The website's maintenance switch is on the settings screen**, because this app is the
  only program that can reach the board to write and a switch on Vercel would be a redeploy
  to close the site and another to open it. One write moves the switch and words the notice
  together — the notice is only read while the switch is on. Three states, not two: a board
  that could not be asked is drawn as that, never as off, since off is the state that means
  visitors are being served.
- **The settings screen is a readout, two settings and a cache.** Connection shows the
  project and board URLs, never the keys. Compression is the only editable part;
  `main/preferences.ts` applies as it writes, so a change takes the next image rather than
  the next launch. Tag cache configures nothing, but a cache is the one thing that can be
  wrong while everything else is right, so it says what it holds and how old it is.

**CPU manners** (`main/cpu.ts`)

libvips spreads one encode across every core, so an upload used to pin a 16-core machine
flat. Two settings bound it: `sharp.concurrency()` from `encodeThreads` (half the cores
by default) and scheduling priority from `encodePriority` (below normal by default).
Neither is `effort` — thread count, priority and compression are independent, and the
measured table there shows fewer threads coming out *smaller* (fewer aom tiles), costing
only wall time. Both are process-wide, applied before the first encode and re-applied on
save. A POSIX host won't let a niced-down process raise itself back, so low → normal
takes a restart; Windows, which this is packaged for, will.

**Views** — `App.tsx` holds `'upload' | 'browse' | 'tags' | 'settings' | 'about'`, with
settings forced open only for a bundle built with no project. Nothing sits
behind a session, because there is none.

- **Open site** is the header item that is not a view: it opens the board in the browser
  via `searchHref('')` and is never drawn active, because it goes somewhere else.
- **The desktop app writes the gallery only, so far.** The write path underneath it is
  board-aware — `createPostFromImage`, `createPostWithTags`, `updatePostWithTags`,
  `deletePostRow` and `applyTagToTagged` all take a `Board` and default to `'post'`, so
  every screen here means exactly what it always did — but nothing in this window yet
  offers a choice of board, which is why `generative_posts` starts empty and fills only
  once one is added. What that costs is one control (Upload, Browse and the post editor
  each need to know which board they are on); what it bought is that none of the existing
  screens had to change to get it.
- **Upload is one image at a time** (`upload-form.tsx`). It was a queue — drop a folder,
  tag twenty cards, upload top to bottom, with reorder arrows, a fold per card, a done
  tick and an Apply-to-all bar. All of that was machinery for keeping twenty half-tagged
  images straight, and tagging is per image however they are stacked: the queue postponed
  the slow part rather than removing it, and what it bought (one press of Upload for
  twenty posts) cost twenty cards of state nothing wrote down. Dropping several files
  takes the first and says so; staging over an image with tags typed into it asks first,
  the same question the ✕ asks.
- **The upload form is hidden, not unmounted**, when another view is in front. Glancing at
  About used to throw away a staged, half-tagged image and orphan an upload in flight.
- **Browse** is the website's gallery, moved here. It runs `@common/data/search`, so a
  query means the same thing in both windows. Its query lives in a module-level `let` —
  coming back to an empty box after finding a post is a search typed twice — and so does
  its **layout**: 🔳 Grid (even columns, cropped square) or 📐 Ratio — one height for every
  image (`--row-h`), width from the ratio, and a ragged right edge. **Not** the website's
  justified rows, which it started as: stretching a row to fill the line makes its height
  depend on which ratios landed on it, so one panorama shrank every thumbnail beside it,
  and comparing two posts at sizes decided by their neighbours is the thing this screen
  is for. `MAX_RATIO` is a fact about the stored thumbnail (768×384), not a layout choice.
  **Its box completes tags** — up to five names under it, from the same cached index the
  tag fields use, matched on the word the caret is in: a `-` in front is the query's, not
  the word's, and a `rating:` token is offered nothing. The list is derived as it is drawn
  rather than stored, so it can be briefly short but never briefly wrong, and five is a
  spelling aid — the whole vocabulary is the Tags screen, one click away.
  The query and the rows it found are written out for a day (`main/browse-cache.ts`), so
  the window opens on the grid it closed on; the layout is not, being a preference rather
  than a copy of what the board said. Thumbnails stay in memory on both sides of the
  bridge — a screenful of `data:` URLs is megabytes of base64 — so a restart redraws the
  grid's shape at once and fills the pictures back in.
- **`CategoryTagField` is the one tag editor**, on the upload form and the post editor:
  staging a post and editing one differ in when the write happens,
  not in what a tag is. It replaced a free-text box that had to guess a category and so
  coined every new tag as general. **A row is a form section, and there is no category on
  the form at all** — `hair color`, then `clothes`, then `hair styles`, in the order the
  board's own `tag_form_sections` are in (`tags.form_section_id` points at one). The
  website has no such division and never will: it shows the category, which is what a tag
  *is*, where a row is where your hand goes, and one Appearance row holding four kinds of
  thing is a row you read before you can aim at it. It is also where the four categories
  cut in the fourth re-cut went — `body`, `clothes`, `accessories`, `exposure` were the
  wrong division for a board and the right one for a form. The two were **nested** for one
  revision, a category heading with its sections indented under it, which asked the
  question twice and forbade the one thing a form row is for: `bikini` is General, `bare
  shoulders` is Appearance, and both go on the row you fill in looking at a swimsuit. What
  a category is still good for here is the **chip's colour**, read off the tag. That also
  took the two assigned columns with it — a split by category means nothing once the rows
  are not categories. **A row is a card, two across**: as a full-width row a section
  was a line of text with a ＋ a screen away at the other end, where the chips that make it
  worth reading take a fraction of that width. Two rather than three, because a column
  count is chosen against the width of the chips — at a third of the window four hair
  colours wrapped onto three lines, costing more height than the column saved. **Two real columns, and which one a row is in is
  stored on the row** (`tag_form_sections.side`), not a flowing grid and not derived. A row
  appears and disappears as the post changes, which is what a section's dependencies *are*,
  and in a flowing grid one row arriving shunts every row after it along, so half the form
  swaps sides while you are reaching for it. It was the parity of a flat `position` for one
  revision, which fixed that and bought its own bug: a single ordered list cannot say that
  one column holds one more than the other, so the surplus row came out on the wrong side
  and the foot of the shorter column was a place nothing could be dragged to. The sides go
  uneven when several conditional rows on one of them are hidden at once, which is what a
  form whose rows come and go looks like. Two columns at every width, since stacking them
  would read down the left half and then down the right. **Nothing folds**: a card is only as tall as what is on it, most
  rows on most posts are empty, and a shut row is a row you cannot see is empty — which is
  the opposite of what this form is for, being reminded of the questions you have not
  answered about the picture. ＋ sits on the heading rather than after the chips, so the
  target does not move as the row fills.
  **A section can have dependencies**, which is the one thing on the field that depends on
  the rest of the post: none and the row is always drawn, `any` and it waits for one of its
  tags, `all` for every one (`dependenciesMet`, on `tag_form_section_deps`). `blue archive`
  waits for `blue_archive`; `hair color` waits for nothing. Implied tags
  count, since the person tagging cannot tell a typed tag from an implied one without
  reading the line below the box. A row the post already has a tag on is drawn whatever its
  condition says — a row that vanishes takes a tag you can no longer see or remove, and the
  post editor would save it straight back.

  This replaced two things. **Form groups** (`tag_rules` kind 2) hid tags *inside* a picker,
  so the row was still drawn with a ＋ that opened onto nothing and could not say why. And
  Character used to match its sections against the post's copyright tags by name in code,
  which was exactly one dependency in `any` mode, hardcoded for one pair of categories.
  **A tag on no row is not offered**, which is the point: an unfiled tag is one the
  vocabulary has not decided about, and that is decided on the Tags screen rather than here
  with a picture in front of you. It is still *drawn*, in a last row called On no row, if
  the post already carries it — a chip that existed and was visible nowhere would be a tag
  you cannot take off, which the post editor would then save straight back. A board with no
  sections anywhere says so in one line rather than as a blank form. The picker a row opens
  offers that
  row's tags alone, whatever categories they are in — **and only tags that exist**: naming
  one is the Tags screen's job,
  which is also the only place a new *section* is named,
  where the whole vocabulary is on screen and a near-duplicate is visible before it is
  made. **A tag is named without a row** — New tag asks for a name and a category and
  nothing else, so a new tag is on no row and offered nowhere until it is filed. Naming and
  filing are two decisions at two moments, and the menu that used to sit on that form got
  answered on the way past. It holds the board's names in a module-level cache shared by every field on
  screen, separate from the Tags screen's: that one carries `post_count` and is dropped on
  every post save, this one holds names and categories, so only `invalidateTagNames()`
  from the Tags screen's own refresh drops it. Nothing in the app types a tag
  name freehand any more: `TagField`, the free-text box with an autocomplete that the tag
  rules used, went when the rules moved onto the Tags grid, leaving `tag-seed.ts` holding
  the `TagSeed` type four modules still import from it.
- **The rules apply where a post is made.** `seedsToInput` appends implications at upload,
  which is the only place the two lists meet; the upload form shows them under the rows and
  names the rule that lifted a rating. The post editor takes recommendations (a press
  commits) but not implications, since nothing there would be writing them.
- **A finished upload reads its post back** and lists what it actually carries, with
  Review tags opening that post's editor — `App` holds the `reviewing` id, since it is the
  one thing one screen sends another, and clears it on any ordinary navigation so Browse
  doesn't reopen an editor nobody asked for.
- **The post editor (`post-editor.tsx`) has no Save button.** Every control writes on use
  and puts the old value back if the write fails; `writeId` is a ref, not state, because
  clicks outrun round trips and an earlier failure must not roll back a later success.
  The screen stays open — Back is the way out, and the grid's stale row is re-read then
  rather than on the save, so correcting a rating twice is two clicks and not two
  searches. Delete is the exception: nothing is left to look at.
- **Tags** lists and manages: click a row for rename / recategorize / delete, **which row
  of the form it sits on** (a menu of every row, since a section is not a division of a
  category — the two are independent, and recategorizing leaves the row alone), **and that
  tag's rules**.
  🧱 **Sections is a view, not a panel** (`form-sections.tsx`), opened like the rule map and
  closed the same way: **a card per row with its tags inside it**, two across, and the
  **unfiled tags in a strip at the top**. It was a list of section names, with which row a
  tag sat on set one tag at a time from a menu on that tag's panel — two halves of the same
  mistake, since filing a vocabulary is a job about sets and a menu per tag is thirty trips
  through a panel showing one name, with no way to see what a row already holds. **Filing is
  a drag** onto a card, written on the drop and drawn optimistically until the way out,
  where the screen behind re-reads once rather than after every drop. **The top strip is not
  a drop target**: unfiling stops a tag being offered anywhere, which is a decision to go
  and make on that tag's own panel rather than one to reach by letting go short of a card.
  The **whole card** takes the drop, since an empty row is the one you are aiming at, and
  the **grip** reorders — which of the two is being dragged is held in state, because a
  dragover may not read what it is carrying. The cards are two stacked columns, the side read off
  each row as on the form; a flowing grid made every row as tall as its tallest card, which
  with one card holding twelve chips and its neighbour none was mostly holes. Reordering is
  an **insert**: drop a card on another to move the row there — either column — or into the
  space under a column to send it to the end of that one, which is the only way to reach the
  foot of the shorter side and was unreachable for as long as the side was a position's
  parity. One write carries both columns in their new order, so a row's side and its place
  in it are the one edit they are. **␣ Space** makes a row that holds nothing and is drawn
  as a gap on the form, which is how a row on one side is brought level with a row on the
  other; it is told from a real row by its name (`isSpacer` / `newSpacerName` in
  `@common/tags`, `__space__<random>`), a magic value in a free-text column defended the way
  `tags.mark` is — one pair of functions knows the spelling — rather than a `kind` column and
  a migration for a row that is a blank space. It is a card with a grip and a ✕ here, since
  this is where it is moved and removed, and nothing at all there. A row's **condition** is answered from the same chips (👆 Choose,
  then click), which is what that gesture used the Tags grid for before it had a screen with
  every tag on it. Order is why `tag_form_sections` is a table — A–Z is an index's order,
  not a form's — and **ids are why a row can be renamed**: the name was the key for one
  revision, and correcting a spelling made a different section while every tag on the old
  one fell off the form. `tags.form_section_id` points at a row, so a rename carries them. **Categories are folded**, a heading and its
  count until clicked: a few hundred tags is a screen you scroll past rather than read, and
  the category you came for is the one thing you already know. Filtering or picking forces
  every one open — both are moments when the answer is a tag you cannot see yet, and a
  filter matching four tags in three folded categories looks like a filter matching nothing
  — with the fold remembered underneath, so clearing the box puts back what you had open.
  Unfolding is `display` and never a read: the whole index is already in memory. **The grid
  is not split by section**: it was, while a section was a division of a category and the
  two screens were the same shape, and repeating that division here now draws the same list
  twice in two arrangements — and makes a category read as an outline of headings rather
  than as the list of what the board calls this kind of thing. Which row a tag is on is the
  Sections screen's question, one click away, and `listTags` stopped carrying the row's
  *name* with it when the last reader of that spelling went: both screens hold the rows in a
  store and match on the id. It is *not* split by
  section's condition, which belongs to the section and is read on the Sections panel. Two rows carry the controls: New tag, Apply by tag, Catalogs and Rule map on
  the title line, then a toolbar of Refresh and a full-width filter box, which is Browse's
  search bar drawn the same way — the first three being what is not about a row you are pointing at,
  and the filter being what makes a few hundred tags browsable now that the grid is also a
  picker. Every button is unbordered (`HEADER_LINK` / `headerToggle`, shared with Browse); the box
  keeps its border, being the one thing you type into. **The grid has two
  meanings**: ordinarily a click opens that tag, and while one of the open tag's two
  rules or a catalog is being filled in (`picking` in `TagIndex`, a union of the two) a
  click toggles that tag in *that* instead, with
  the count column showing ✓/＋ rather than a number for as long as that lasts. The
  catalogs panel and a tag's own both pin to the top of the scroller, so `showPanel` makes
  them take turns and ends any pick with the panel that was answering it. **Its
  posts** hands the tag name to Browse via `browseFor` and switches to it, rather than
  opening `/tags/<id>` in a browser — the reason to ask what a tag is on is usually to fix
  one of them, and only this window can. The category menu is `TAG_CATEGORIES` — **adding one is a line there plus
  a colour**, and no migration, since the column is free-form text. Reads don't assume
  the list (`categoryOrder` puts an unknown category after the known ones rather than
  dropping its tags); writes do (`z.enum(TAG_CATEGORIES)` on both IPC channels). Each drops the cached index. Its list is cached in a module-level `let`
  because the view unmounts whenever something is in front of it; 🔄 re-reads (clearing
  main's copy first, or it hands back the same list) and `invalidateTags()` drops it when
  an upload or edit lands.
- **About** is the exception to the screen order — "what version is this" is fair to ask
  of a copy that cannot reach its board. It carries what `app:status` reports, since the
  renderer has no `process` and a packaged app ships no manifest.

**Tag rules** — two kinds, both the **board's** now, and **not a screen**:
they sit on the panel of whichever tag the Tags screen has open (`tag-rule-editor.tsx`),
because a rule is written *about* a tag and the screen with every tag on it — spelling,
category, count — was the other one. They had their own screen whose first box named the
trigger; that box was the whole problem, since the name it asked you to type was already
on the list next door. The trigger is now the row that was clicked, so a rule has a left
side that cannot be misspelled. **The right side is not typed either** — Choose turns the
grid below into the picker and a click ticks a tag into the rule — so a rule can only name
tags the board has, which is the rule everywhere a post is tagged and is now true here, on
the one screen where coining the missing one is a button away. What that costs is the form
that wrote several rules at once (`white_bra black_bra red_bra → bra`), now three
selections, and a rule written ahead of the tag it names — which used to sit silent and
now fails the upload that fires it, since no write path coins a tag any more.
`rule-diagram.tsx` is the other half: 🗺️ Rule map, top right of Tags, draws every rule at
once as the forest it is — implications chain, and one row per rule is exactly what hides
that. Read-only, because a screen that both explains and edits invites an edit made on a
picture rather than on a tag. Both rule sets are one habit with two answers to "this tag
is on the post, what else should be?". Both are rows on **`tag_rules`**, one table with a
`kind` column — the two differ in what the app does with a row and not at all in its
shape; the column is a `smallint`, 0 implies and 1 recommends, and `RULE_KIND` in
`@common/data/rules.ts` is the only place either number is spelled — both parsed on the
way in by a `normalize…` that doubles as the IPC validation (stricter than a zod schema of
the same shape, since every name must match `TAG_PATTERN`), and both reaching the window
through one module-level store
(`renderer/src/rule-store.ts`) rather than React state — the tag field consults them on
every keystroke, and a round trip per keystroke would be a query per keystroke.

Two of them were `{ tag: [name, …] }` sections of `save.json` until they moved. A file could
not do three things a table does: a rule naming a tag that was later **renamed** went
quietly dead and stayed dead, a rule naming a **deleted** tag did the same, and the rules
were one machine's — a reinstall started with none. Rows are tag **ids**, so a rename
carries every rule that names it and a delete takes them with it; `@common/data/rules.ts`
is the only place ids and names meet, because everything above it — the store, the
diagram, the picker — is written in names. What it costs is that a window which cannot
reach the board has no rules, which the store treats as none rather than as a failure to
render. An implied **rating** cannot be a row, so it is `tags.implied_rating`, one per tag,
folded back into the implied list as a `rating:` token on the way out. A write sends one
tag's whole list — the panel editing a rule has exactly that tag open — and the Tags
screen's 🔄, which is also where a rename or a delete lands, re-reads both sets.

- **Implications are applied.** `white_bra → bra`: the specific tag is the one you
  remember to type, the broad one is the one that gets forgotten, so the post never comes
  back for the search anyone would run. Expansion is transitive and cycle-safe. **A rule
  may imply a rating**, spelled `rating:r18` in the same list — the board's own
  grammar, which is why `asRating` is exported rather than written twice. It is a
  **floor**: `raisedRating` only lifts a row, so a later rule can't talk an explicit post
  back down. The tag field shows what they imply *under* the box, never in it — the box
  is the record of what was typed by hand — and the implied line is derived every render,
  never state. `tagsToInput(value, rules)` is the one place the two lists join. The rule
  editor's own boxes pass `applyImplications={false}`: a name typed there is the name
  itself, not a post carrying it.
- **Recommendations are only offered.** `panties → black_panties bow_panties`: what
  *usually* goes with a tag is a question only the person looking at the picture can
  answer, so they are chips with a `+` and nothing happens until one is pressed. **One
  level deep**, unlike implications — a chain of maybes is how a three-tag post ends up
  under thirty chips nobody reads; pressing a chip brings its own on the next render, so
  the chain is walked by choosing. Anything already typed or implied is left out. No
  ratings: a rating is not a chip you press, and `TAG_PATTERN` drops the token on its
  colon for free.

**Tag catalogs** — the other section of `save.json` and the third answer to "what else
goes on this post?", `{ name: [tag, …] }` like the two rule sets were, same `normalize…`
doubling as the IPC validation, same module-level store. Still a file, because a catalog
is a way of working rather than a fact about a tag — and it is written whole, which is why
`createRuleStore` is parameterized on what a write takes. What makes it a different thing
is *who asks*: an implication fires by itself and a recommendation offers itself, and a
catalog does neither until it is picked **by name** — so it holds what is true of a set of
images rather than of a tag, which is what no rule can say. It is built on the Tags screen
(`tag-catalogs.tsx`, ➕ New names one, 👆 Choose fills it from the grid, 📋 From a post
fills it from a post via the upload form's own `TagImport`) and applied from
`CategoryTagField`'s `catalogs` prop, which puts 📚 Catalogs on the heading row of every tag
field — the upload form and the post editor — so it reaches a post being made and one
already on the board alike. **Names only**: no rating, for the recommendations' reason, and no category, which
is looked up in the board's index when the catalog is applied — a stored one would be a
lie the first time a tag is recategorized. A name the index doesn't have is skipped rather
than coined, and the menu's `＋n` counts what a press would actually add. **An empty
catalog survives `normalizeCatalogs`**, unlike an empty rule: naming one before filling it
is the ordinary order, and the delete button is what removes one.

**Tag index cache** (`main/tag-cache.ts`) — the board's tags on disk for a day, serving
both `tags:list` and `tags:suggest`. Autocomplete was a query per pause in typing, which
over twenty images is hundreds of requests asking a question whose answer moves only when
someone uploads. A whole board of names and counts is a few hundred kilobytes, so it is
read once and prefix-matched in memory with the ordering the SQL used (`post_count desc`,
ties by name). Its own file in `app-cache/`, not `save.json`: that one is settings, this
is derived data droppable at any moment. It is dropped by any write that changes a tag
*row* — creating, renaming, recategorizing, re-sectioning, marking, deleting, applying one
tag across another's posts — by the settings screen's Clear cache and by the Tags screen's
🔄. A failed refill keeps serving the stale copy rather than nothing, and a read that comes
back at `CACHE_LIMIT` is treated as "there may be more", so suggestions fall back to
querying.

**An upload does not drop it — it patches the counts** (`bumpTagCounts`). Dropping was by
some way the most expensive thing this app did repeatedly: an upload moves `post_count` and
moves nothing else, since no write path coins a tag, so throwing away a few hundred rows of
names, categories, marks and sections to learn a handful of numbers meant the next tag
field re-read the whole board — once per upload, now that one image is staged at a time.
The arithmetic needs no query and is exact: the post is new, a duplicate having been
refused at staging, and its tag list is deduped, so every tag on it gained exactly one post
— the same number `syncTagPostCounts` recomputed on the board. The `at` stamp is left
alone, since patching counts does not make the copy newer about anything else and touching
it would postpone the daily read that catches a rename made from another install.

**The cache folder** (`main/app-cache.ts`) — `app-cache/` in `userData`, holding
`tags.json`, `browse.json` and `thumbs/`. Everything in it is a copy of what the board
already has, so the folder can be deleted at any moment and the only cost is the next read
— which is the line between it and `save.json`, where losing a file loses something. The
two JSON files are stamped `{ at, … }` and stale after a day; what stale *means* is each
cache's own, the tag index serving a day-old copy rather than nothing when a refill fails
and the browse grid simply being dropped. A person invalidates either with a 🔄 —
Browse's, which re-reads the board, or the Tags screen's.

**Thumbnails** (`main/thumb-cache.ts`) — `app-cache/thumbs/<file_name>.avif`, the stored
file byte-for-byte. `thumbnailDataUrl` reads memory, then here, then the board, so the
grid `browse.json` brings back also comes back with its pictures. **Nothing expires and
nothing is invalidated**: the name is the md5 of the bytes, so a file found under it *is*
that image — the same reasoning the in-memory maps already run on. That is also why it is
a folder of bytes rather than base64 in the JSON, which would be a third bigger and
rewritten whole every time one arrived. Bounded by the board, one small file per post, and
`removePost` sweeps up the only name that can ever stop meaning an image.

**DNS** (`main/dns.ts`) — it resolves like a browser, not like the host. Every open-web
fetch it makes is an address dragged out of a browser, and a browser on DoH will happily
show an image the machine's own resolver answers NXDOMAIN for. `configureHostResolver`
names Google and Cloudflare in `secure` mode; `automatic` only upgrades when the
*system's* provider speaks DoH, which is never true on the networks this is for. It
reaches only Chromium's stack (the drag downloads) — the database goes over a socket and
the bucket over Node's `fetch`, both on the OS resolver, which is what makes a DoH-only
setting safe.

**Closing asks, if the upload form holds anything** (`main/close-guard.ts`). A staged image is
hand-typed tags that exist nowhere else; an uploaded one is the only copy of the post
number just made. The renderer pushes what it holds on every change rather than main
asking at close time: a `close` handler vetoes synchronously or not at all, so it cancels
the close and re-issues it as `destroy()` if the answer is yes.

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
  `0004_section_sides.sql` and `0005_generative_posts.sql`. Schema changes from here are **always** a new numbered file, never a
  dashboard edit and never an edit to the baseline once pushed anywhere real.
  `scripts/migrate.mjs` applies each inside a transaction and records it in `_migrations`.
- **`db/grants.sql` is not a migration** and re-runs on every `db:push`. Who may do what
  is desired state, not history: roles are made after the schema exists and remade when a
  password changes, and a grant block inside the baseline ran once, before either.
- **There is no `db:reset` and no seed.** Reset was `drop schema public cascade` behind
  one word — the whole board, with the images left in R2 as orphans nothing could name —
  and it was worth having only while the schema moved under a board with nothing on it.
  Rebuilding from nothing is rare enough to type out in a console, where the statement is
  visible. The seed went earlier and separately: three tags, and a starter vocabulary is a
  guess about a board somebody else is making. Tags are named on the Tags screen, where the
  whole list is on one page and a near-duplicate is visible before it is made. A post could
  never have been seeded anyway — its row is half of a pair, the other half being two
  objects named after the md5 of bytes no SQL file has.
- **No SQL functions and no triggers.** Search, the post writes, the view counter and the
  counters all moved to TypeScript — a plpgsql body needs a migration to edit and reports
  one opaque error from inside a statement that was about something else. Don't add RPCs
  back without a reason plain SQL genuinely can't meet — which is a much shorter list now
  that the queries are plain SQL.
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
  place that decides which — shared, so a tag looks the same on the site and in the app.
  It replaced a guess: the desktop used to paint a dot on any name starting with a colour
  word from a list in code, which read `golden_retriever` as gold and could not be
  overridden. `readTagMark` is what may be written; `''` clears it.
- **One denormalized counter**, `tags.post_count`, in `@common/data/counters`, and one
  statement. It **recomputes** rather than incrementing — an increment that loses a race
  is wrong for good, where a recount reads the rows that define the number and is right
  regardless. That is not in tension with `view_count`, which increments: a view is
  derived from nothing, so the increment *is* the record. It logs rather than throws: the
  post write has already landed by then.
- **No RLS. Three roles** — `booru_owner` (migrations only), `booru_app` (the desktop,
  writes everything, owns nothing), `booru_web` (Vercel, reads everything plus `update
  (view_count) on posts`). **Create them with SQL, never in Neon's console:** a
  console-made role gets `neon_superuser` plus CREATEDB/CREATEROLE/BYPASSRLS, which
  overrides every grant, and the owner cannot revoke it — the only repair is to drop the
  role and remake it.

## Ratings

- **Two tiers, `g` and `r` — General and R-18.** It was Danbooru's four, and the middle
  two were a judgement nobody made the same way twice while the board did nothing with
  either answer but decide whether a post sits behind the setting. That is one bit, so it
  is one bit; how sexual a post actually *is* is what its tags are for. A letter rather
  than a boolean because a third tier (pixiv has R-18G) should stay a code change.
- **Stored as one letter, written as a word.** That is `RATINGS`, and what `Rating` means
  everywhere in the code. A query spells it out (`rating:r18`); `RATING_NAME` is the only
  translation; `RATING_LABEL` is the third form and the only one a person reads.
- **Reading is loose, writing is strict.** `asRating` accepts `rating:r18` *and*
  `rating:r`, because someone who has seen the column will type the letter.
  `ratingToken` only ever writes the name, so every link, chip and saved query the app
  produces has one spelling and a hand-typed URL still works.
- **`RESTRICTED_RATINGS` (`r`) gates three things.** That tier stays out of
  `sitemap.xml` and is `noindex`ed; the listing leaves it out until the NSFW cookie is
  set; and `/posts/[id]` itself renders `<RestrictedNotice />` instead — a post's own URL
  is reachable without going near a listing, which is what a link, a bookmark or a
  private window is. The **metadata is gated too**: the tags were the title and the
  thumbnail was the OpenGraph image, so an unfurl described the post past its own gate,
  and nothing fetching that carries the cookie. Still not access control — the cookie is
  a checkbox anyone can tick, and there are no accounts to attach an age to.
- **A ceiling the query narrows within, never lifts.** `resolveRatings` takes the visible
  set as a second argument (both tiers when omitted, which is what the desktop app gets),
  intersects the query's own `rating:` metatags with it, and can return an empty
  whitelist — so `rating:r18` typed with NSFW off honestly returns nothing rather
  than reaching past the setting. The listing says why, with a link to `/settings`.
- The column is free-form text with no check constraint, so a new tier is a code change
  only.

## Images

- **One R2 bucket, two prefixes per board** — `posts/<name>.<ext>` and
  `thumbs/<name>.avif` for the gallery, `generative/posts/` and `generative/thumbs/` for
  the AI board (`@common/board` picks the pair). Paths derive from `file_name` (the md5 of
  the uploaded bytes), never stored. It was two
  buckets, which is two public hostnames for two halves of the same thing; a prefix costs
  nothing. Objects are written with `Cache-Control: immutable` for a year, which is free
  correctness given the name *is* the content hash.
- **Both encoders are lossy AVIF** (`@common/imgcmp/`). The thumbnail is 384px tall,
  width capped at 768 for panoramas, `mitchell` kernel, always quality 50 — the web grid
  scales by row height, so height is the bound that matters, and `THUMB_MAX_HEIGHT` and
  that grid's `MAX_ROW × --row-h` are one decision and must move together. The post image
  is kept only when it beats the uploaded bytes, otherwise the original is stored
  byte-for-byte. Lossless was measured and rejected on size (3.6MB from a 1.9MB JPEG).
- **The post image's quality is a ramp on its longer side** (`postQualityFor`): 50 at
  1920px and above, rising in a straight line to 75 at 1280px and below — 1600px is 63,
  1440px is 69. Quality 50 is the right trade for something the resize is already taking
  detail from and the wrong one for an image that arrives at the size it will be looked at
  — nothing is thrown away, so every artefact is seen at 1:1, and there are far fewer
  pixels to pay for. A ramp rather than steps because the argument strengthens gradually
  and steps put a cliff between two uploads a pixel apart. Landscape, portrait and square
  all reduce to `Math.max(width, height)`, which is what the code says; unreadable
  dimensions take the floor, not the ceiling. Nothing above the floor can bloat a post:
  the only path that keeps the AVIF without comparing it to the uploaded bytes is an image
  over `POST_MAX_DIMENSION`, which is over 1920 and so on the floor.
- **The stored post image is bounded to 2048 on both sides** (`POST_MAX_DIMENSION`).
  Above it the AVIF is not competing on bytes — it is the only version inside the cap, so
  it is kept however it measures, and the row records the *stored* size, not the uploaded
  one. An animation is the one thing that can still exceed it: the encoder declines rather
  than flatten it to frame 1.
- **MD5 is the dedup key on purpose** — collision resistance is not what it's for.
- `view_count` is bumped only by `recordPostView` from the browser, never on a read path,
  so prefetches, `generateMetadata` and crawlers don't inflate it.

## Style

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
  these are not links: they run searches, unfold panels, delete tags.
  - The ground must be a step from whatever the button sits on, so there are two:
    `BUTTON` / `BUTTON_SM` (`hover:bg-surface`) for the page, `BUTTON_ON_SURFACE`
    (`hover:bg-background`) inside a panel or a bordered row. Two `hover:bg-*` utilities
    in one class list is a coin toss decided by stylesheet order, which is why they are
    separate constants and why `buttonToggle(active)` swaps the colour into the shape
    instead of appending one.
  - `buttonToggle` is accent while what it opened is open — the whole of what an outline
    used to say. `BUTTON_SUBMIT` is accent always, for the control that finishes a form.
  - **The exception is text that genuinely is a link** — a URL or a post number in a line
    of prose, in About, Settings and a finished upload. Those stay `text-accent
    hover:underline`, because they go somewhere and a person should know that before
    clicking.
- **A placeholder is an example, not a description.** `blue_hair`, not "filter tags";
  `1girl blue_hair -solo rating:r18`, not "tags, -excluded, rating:r18". The
  label and the heading already say what a box is for, and a box saying it a third time
  teaches nothing — an example shows the spelling, the separator and the grammar at once.
- **Prefer an emoji to a drawn icon**, and pick a fancy one where a fancy one fits — 🔄,
  ➕, 🧩, 📋, ✅, 🗑️, 🖼️. They cost no SVG, no component and no import, they carry colour
  the palette otherwise has none of, and a control that is one glyph beside its own words
  is read faster than a line drawing. Always `aria-hidden` with the real label in text or
  in `aria-label` — an emoji is decoration, and a screen reader announcing "package" for
  Import is worse than silence.
  The exception is a control drawn *only* as a glyph and repeated down a list, where a
  stroked icon at a known size is steadier than a font the OS chooses: that is what
  `renderer/src/components/icons.tsx` is for (the upload form's bin), and it stays a small
  file. If a new one is not one of those, it is an emoji.
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
| `packages/desktop/changelog/` | A file per release, for a cadence this app does not have; the reasoning belongs in the commit and beside the code |
| `packages/desktop/build-id` | A second number saying what `package.json`'s version already said, and the version has the advantage of being what electron-builder stamped on the copy actually running |
| The upload **queue** — `upload-queue.tsx`, the reorder arrows, the per-card fold, the done tick, the Apply-to-all bar | Machinery for keeping twenty half-tagged images straight. Tagging is per image however they are stacked, so the queue postponed the slow part rather than removing it, and charged twenty cards of unsaved state for one press of Upload |
| `tags.category2` and everything spelling it — `Subcategory`, `normalizeSubcategory`, `subcategoryLabel`, `subcategoryOrder`, `setTagSubcategory`, `tags:set-category2` | A heading *inside* one picker: it could divide a category and never shorten one, since every subgroup was drawn whatever the post was about. What divides one now is `tag_form_sections`, a row of the form with its own ＋; what makes a row come and go is that row's own dependencies |
| **Form groups** — `tag_rules` kind 2, `shared/groups.ts`, `renderer/src/groups.ts`, the Form group panel and the rule map's third section | The right question in the wrong place. A group hid tags *inside* a row, so the row was still drawn, still had its ＋, and opened onto a picker that was empty for reasons the picker could not state — and the rule was written on the tag it hung off, which is the one screen where you are not thinking about the form. `tag_form_section_deps` says it about the whole row instead |
| **The form's category headings** — `tag_form_sections.category`, `RIGHT_COLUMN` and the field's two assigned columns, the section menu clearing on a recategorization | A section inside a category asked the question twice: a category says what a tag *is*, which is the website's question, and a row says where your hand goes. It also forbade the one thing a form row is for — `bikini` is General and `bare shoulders` is Appearance, and both belong on the row you fill in looking at a swimsuit. The form is one flat ordered list of foldable rows; the category survives as the chip's colour |
| The hardcoded Character↔copyright match (`LINKED_CATEGORY` / `LINKING_CATEGORY` / `OTHER_SECTION`) | One dependency, in `any` mode, spelled in code for one pair of categories. It is a row you can see and change now |
| **Supabase entirely** — PostgREST, RLS, both Storage buckets, the CLI, `@supabase/supabase-js`, `src/lib/supabase/`, `supabase/config.toml` | Postgres on Neon and a bucket on R2. What PostgREST cost was visible in one file: multi-tag AND is the one thing it cannot express, so the search resolved tag membership in TypeScript over thousand-row pages of `post_tags`. RLS went with the anon key — with no public credential, a `grant` says what a select-only policy was standing in for, and says it about writes too |
| `@supabase/supabase-js`'s query builder — 62 call sites, every embed, `maybeSingle()`, `count: 'exact'`, `.range()` paging | Plain SQL through `postgres` (porsager). The counters became one `update … from`, the view counter went back to `+ 1`, the post write became a real transaction, and the search became one statement |
| The **four-tier rating scale** (`g`/`s`/`q`/`e`) | Two tiers, General and R-18. The middle two were a judgement nobody made the same way twice, and the board did nothing with either answer except decide whether a post is behind the setting |
| The unwind in `createPostWithTags` | A transaction. An unwind is itself a write that can fail, which is the case it could do nothing about |
| `src/lib/env.ts`, `next.config.ts`'s `images.remotePatterns` | The first became `isDatabaseConfigured()` beside the pool; the second allow-listed a host for an optimizer nothing has used since both images went `unoptimized` |

The rating scale has now been rewritten four times and never once needed a migration,
which is the whole argument for that column being free-form text: `general, e1..e5` →
four names → the letters → the two tiers. `posts.md5` → `posts.file_name` went the same
way. Saved queries holding an old spelling were left to rot on purpose — `asRating`
returns null for one, so it degrades to a tag that matches nothing.

**The board was emptied for the move to Neon**, and the posts re-uploaded by hand rather
than migrated: the vocabulary a set of images deserves is not the one they were first
tagged under, and re-tagging is the work either way. That is what made the schema squash,
the id columns narrowing to `integer` and the rating collapse free.

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
