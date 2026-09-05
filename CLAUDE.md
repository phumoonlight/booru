@AGENTS.md

# Pubooru

A booru-style image board (Danbooru is the reference): tag-centric gallery, multi-tag
search with negation, post detail pages. Next.js 16 App Router + Supabase (Postgres,
Storage), Tailwind v4, mobile-first.

**The website is read-only and has no accounts.** Everything that changes the board —
uploading, editing, deleting, the tag vocabulary — happens in the desktop app, which
writes with a service-role key compiled into its own bundle. Most of the shape below
follows from that one fact.

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
| `npm run db:push` / `db:push:dry` | apply migrations to the linked project |
| `npm run db:list` / `db:reset` / `db:reset:remote` | migration status / local reset / reset the linked project |
| `npm run desktop:dev` / `desktop:package` | window, or installer. Both need the four env values |
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

1. **Never call Supabase from a page or component.** Reads go RSC → `src/lib/data/*` →
   `@common/data/*`.
2. **Never add a write to `src/`.** No table has an insert/update/delete policy, so the
   anon key cannot write. Mutations belong in `packages/desktop`.
3. **Nothing in `packages/common` builds a client** — the caller passes one. `admin.ts`
   is `server-only`, so a module that built its own could not run in Electron.
4. **Nothing in `packages/common` imports `next/*`, `server-only` or React**, reads the
   environment, or hardcodes a limit. Electron's main process compiles these files.
5. **Every write that moves tags must call `syncTagPostCounts`** with the tags it moved.
   No trigger does it any more.
6. **Preserve the unwind in `createPostWithTags()`** — there is no transaction; it
   deletes the post it inserted if tagging fails.
7. **A Tailwind class in `packages/common` needs an `@source` line** in
   `packages/desktop/src/renderer/src/styles.css`, or it compiles to nothing in the
   desktop build. Currently `CATEGORY_COLOR` (`@common/tags`) and `RATING_COLOR`
   (`@common/search`). The failure can be *partial*, where a hex shared with another
   scanned constant happens to survive.
8. **`searchHref()` is the only thing that spells the listing's path.** Tag links,
   facets and the feed all derive from it.
9. **Re-measure with `npm run bench:avif` before changing a constant in
   `@common/imgcmp/`.** Those numbers were measured, not chosen.
10. **Bumping `packages/desktop/package.json` and writing
    `packages/desktop/changelog/<version>.md` are one change.** About reads the version,
    so drift makes the app lie about itself.

## Layering

- **Reads:** RSC → `src/lib/data/*` → `@common/data/*` → the anon client. The one read
  that isn't an RSC is `loadMorePosts` in `lib/actions/search.ts` — the feed's next
  chunk, an action rather than a route handler so the data layer stays the only query
  surface.
- **The website's only write is `recordPostView`**, on `admin.ts`, because a visitor's
  view still counts.
- **Two Supabase clients:** `anon.ts` (cookie-less, every read) and `admin.ts` (service
  role, `server-only`, the view counter and nothing else).
- **Query logic lives in `lib/data/` and `@common/data/`**, never in actions or pages, so
  a second caller can reuse it — which is how the desktop app browses the board.
- **Pure helpers** (`@common/search`, `@common/tags`, `@common/storage`, the web's
  `lib/site.ts`) import nothing server-side, so client components can share them.

## `packages/common`

The post write path, the search, the counters, both encoders, and the pure helpers. See
[packages/common/README.md](packages/common/README.md).

- **`@common/*` is a tsconfig `paths` mapping** to `packages/common/src`. No build step,
  nothing published; files in there import each other by `@common/…` too, so a module
  reads the same wherever it is compiled. The web gets the mapping from the root
  `tsconfig.json`; the desktop needs it twice — `packages/desktop/tsconfig.json` for the
  type checker and a Vite alias in `electron.vite.config.ts` for the bundler.
- **One client argument, not two.** `@common/data/{posts,search,shared,tags,counters}`
  and `@common/upload/pipeline` take a client and never build one. Don't simplify the
  parameter away.

## The website (`src/`)

- **Seven routes**, and none of them writes: `/`, `/posts`, `/posts/[id]`, `/tags`,
  `/tags/[id]`, `robots.txt`, `sitemap.xml`. There is no `/upload`, `/login`, `/account`,
  `/tags/manage` or `src/proxy.ts` (Next 16's `middleware.ts`) — see [History](#history).
- **The gallery is `/posts`, not `/`.** `/` is a landing page: wordmark, search box,
  emoji post count. `/?query=` redirects to the listing for old links.
- **`?query=` is the only param the listing has** (`SEARCH_PARAM` in `@common/search`),
  space-separated, `-tag` excludes. Ratings and the cursor ride in the same string as
  `rating:explicit` and `start:900` metatags — nothing outside `splitQuery` and
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
- **`/tags/[id]` is a sample, not a listing** — ten posts, up to fifty, then a link into
  the gallery. No search box, no facets, no cursor: browsing a tag to its end is what
  `/posts?query=<tag>` is for.
- **Nothing goes through the Next optimizer.** Both the grid thumb and the detail image
  are `unoptimized`, so the stored file is served untouched — animation intact, no second
  lossy pass. The grid used to be optimized and visibly softened thumbnails: Next scales
  the requested quality by 50/80 for AVIF, so the default 75 became quality 47 at effort
  3, for a resize its optimizer could not perform anyway (`withoutEnlargement`).
- **Rating blur is a `data-blur-ratings` attribute on `<html>`**, set before first paint,
  so the grid stays a plain server render (`lib/rating-blur.ts` + `globals.css`).
- **Saved queries are `localStorage`**, so they need no account (`lib/saved-queries.ts`,
  module store in `use-saved-queries.ts` — the sidebar renders twice and both copies must
  agree). A row's identity is its tags, the query minus `start:`, which is what lets 💾
  move a saved cursor without a second row or any selection state.
- Pages fall back to `<SetupNotice />` when `isSupabaseConfigured()` is false, so the app
  is browsable before the environment file has been filled in.

## The desktop app (`packages/desktop`)

The upload page as a desktop app, because compression is CPU work a free serverless tier
is bad at — see [packages/desktop/README.md](packages/desktop/README.md). It imports
`packages/common` and reaches into `src/` not at all.

**Process split**

- The renderer has no keys, no Node and no network. Every capability is one
  `ipcMain.handle` in `src/main/ipc.ts`; the file's bytes are read on the main side.
- **One Supabase client** (`main/supabase.ts`): the service role, from the key compiled
  into the bundle. It signs in to nothing.
- **Its limits are its own** (`main/limits.ts`, 50MB / 100MP) and now the only ones.
- Renderer CSP is `img-src 'self' data:`. Browse's thumbnails cross the bridge as `data:`
  URLs rather than being fetched by the page — a grid is not worth being the reason that
  stops being true. `main/manage.ts` caches them by file name, which can never go stale.

**Configuration**

- **Which board it talks to is compiled in, not typed in.** `electron.vite.config.ts`
  reads the repo's environment file at build time and `define`s four values into the main
  bundle — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` — all **required**, the build
  throwing with the missing names rather than shipping an installer that reaches nothing.
  The site URL is optional for the website (Vercel supplies a fallback) and not here: it
  is how a finished post gets opened. `main/config.ts` reads `__BUILD_ENV__` and nothing
  else; only the main bundle gets the `define`, so no key is compiled into a file the
  window loads.
- **`save.json` holds preferences and both sets of tag rules, and nothing else**
  (`main/save-file.ts`). Plain readable text on purpose: it can be inspected, hand-edited
  and copied, and there is nothing secret left in it. `userData` is pinned in
  `main/index.ts` rather than defaulting to the app's display name, so renaming the app
  doesn't move the settings — `pubooru-desktop` packaged, `pubooru-desktop-dev` in a
  checkout, so `desktop:dev` runs from its own rules and both can be open at once. A file
  that won't parse is treated as absent, costing the settings and never a crash.
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

**Views** — `App.tsx` holds `'upload' | 'browse' | 'tags' | 'rules' | 'settings' |
'about'`, with settings forced open only for a bundle built with no project. Nothing sits
behind a session, because there is none.

- **Open site** is the header item that is not a view: it opens the board in the browser
  via `searchHref('')` and is never drawn active, because it goes somewhere else.
- **The queue is hidden, not unmounted**, when another view is in front. Glancing at
  About used to throw away a staged, half-tagged queue and orphan an upload in flight.
- **Browse** is the website's gallery and edit panel, moved here. It runs
  `@common/data/search`, so a query means the same thing in both windows. Its query lives
  in a module-level `let` — coming back to an empty box after finding a post is a search
  typed twice.
- **Tags** lists and manages: click a row for rename / recategorize / delete, with New tag
  and Apply by tag above the list, those being the two operations not about a row you are
  pointing at. Each drops the cached index. Its list is cached in a module-level `let`
  because the view unmounts whenever something is in front of it; 🔄 re-reads (clearing
  main's copy first, or it hands back the same list) and `invalidateTags()` drops it when
  an upload or edit lands.
- **About** is the exception to the screen order — "what version is this" is fair to ask
  of a copy that cannot reach its board. It carries what `app:status` reports, since the
  renderer has no `process` and a packaged app ships no manifest.

**Tag rules** — two kinds, both the app's and neither the board's, on one screen
(`tag-rules.tsx`), because they are one habit with two answers to "this tag is on the
post, what else should be?". Both are `{ tag: [name, …] }` sections of `save.json`, both
parsed by a `normalize…` that doubles as the IPC validation (stricter than a zod schema
of the same shape, since every name must match `TAG_PATTERN`), and both reach the window
through one module-level store (`renderer/src/rule-store.ts`) rather than React state —
the tag field consults them on every keystroke, and a round trip per keystroke would be a
file read per keystroke.

- **Implications are applied.** `white_bra → bra`: the specific tag is the one you
  remember to type, the broad one is the one that gets forgotten, so the post never comes
  back for the search anyone would run. Expansion is transitive and cycle-safe. **A rule
  may imply a rating**, spelled `rating:explicit` in the same list — the board's own
  grammar, which is why `asRating` is exported rather than written twice. It is a
  **floor**: `raisedRating` only lifts a row, so a later rule can't talk an explicit post
  back down. The tag field shows what they imply *under* the box, never in it — the box
  is the record of what was typed by hand — and the implied line is derived every render,
  never state. `tagsToInput(value, rules)` is the one place the two lists join. The rules
  screen's own boxes pass `applyImplications={false}`: a name typed there is the name
  itself, not a post carrying it.
- **Recommendations are only offered.** `panties → black_panties bow_panties`: what
  *usually* goes with a tag is a question only the person looking at the picture can
  answer, so they are chips with a `+` and nothing happens until one is pressed. **One
  level deep**, unlike implications — a chain of maybes is how a three-tag post ends up
  under thirty chips nobody reads; pressing a chip brings its own on the next render, so
  the chain is walked by choosing. Anything already typed or implied is left out. No
  ratings: a rating is not a chip you press, and `TAG_PATTERN` drops the token on its
  colon for free.

**Tag index cache** (`main/tag-cache.ts`) — the board's tags on disk for a day, serving
both `tags:list` and `tags:suggest`. Autocomplete was a query per pause in typing, which
over twenty images is hundreds of requests asking a question whose answer moves only when
someone uploads. A whole board of names and counts is a few hundred kilobytes, so it is
read once and prefix-matched in memory with the ordering the SQL used (`post_count desc`,
ties by name). Its own file, not `save.json`: that one is settings, this is derived data
droppable at any moment. It *is* dropped after every upload and every tag edit, by the
settings screen's Clear cache and by the Tags screen's 🔄. A failed refill keeps serving
the stale copy rather than nothing, and a read that comes back at `CACHE_LIMIT` is
treated as "there may be more", so suggestions fall back to querying.

**DNS** (`main/dns.ts`) — it resolves like a browser, not like the host. Every open-web
fetch it makes is an address dragged out of a browser, and a browser on DoH will happily
show an image the machine's own resolver answers NXDOMAIN for. `configureHostResolver`
names Google and Cloudflare in `secure` mode; `automatic` only upgrades when the
*system's* provider speaks DoH, which is never true on the networks this is for. It
reaches only Chromium's stack (the drag downloads) — Supabase goes over Node's `fetch`
and the OS resolver, which is what makes a DoH-only setting safe.

**Closing asks, if the queue holds anything** (`main/queue-guard.ts`). A staged row is
hand-typed tags that exist nowhere else; an uploaded one is the only copy of the post
number just made. The renderer pushes its counts on every change rather than main asking
at close time: a `close` handler vetoes synchronously or not at all, so it cancels the
close and re-issues it as `destroy()` if the answer is yes.

**Changelog** — a file per version in `packages/desktop/changelog/`. Keep entries short:
a heading, then `### Added` / `### Changed` / `### Fixed` bullets of a line or two,
written as what a user would notice. Reasoning belongs in the commit and beside the code.

## Database

Full reference: [docs/database-schema.md](docs/database-schema.md).

- **Four migrations: storage, then one per table** — `20260826090000_storage_buckets.sql`,
  then `posts` → `tags` → `post_tags` in foreign-key order. Each table's file holds its
  columns, indexes **and** RLS policies. Schema changes from here are **always** a new
  timestamped file, never a dashboard edit and never an edit to the squashed four once
  pushed anywhere real.
- **`supabase/seed.sql` is data, not schema.** It runs on `db:reset` and
  `db:reset:remote`, never on `db:push`, so nothing in it may be something the app needs
  to exist. Tags only: a seeded post would name storage objects the file has no bytes for.
- **No SQL functions and no triggers.** Search, the post writes, the view counter and the
  counters all moved to TypeScript — a plpgsql body needs a migration to edit and reports
  one opaque error from inside a statement that was about something else. Don't add RPCs
  back without a reason PostgREST genuinely can't meet.
- **One denormalized counter**, `tags.post_count`, in `@common/data/counters`. It
  **recomputes** — PostgREST can't increment, and an increment that loses a race is wrong
  for good. It logs rather than throws: the post write has already landed by then.
- **RLS is select-only on every table.** Writes bypass it on the service role.

## Ratings

- **Stored as one letter, written as a word.** `posts.rating` holds `g`, `s`, `q` or `e`
  — that is `RATINGS`, and what `Rating` means everywhere in the code, in `data-rating`,
  `data-blur-ratings` and `blurred_ratings`. A query spells it out (`rating:explicit`);
  `RATING_NAME` is the only translation; `RATING_LABEL` is the third form and the only one
  a person reads.
- **Reading is loose, writing is strict.** `asRating` accepts `rating:explicit` *and*
  `rating:e`, because someone who has seen the column will type the letter.
  `ratingToken` only ever writes the name, so every link, chip and saved query the app
  produces has one spelling and a hand-typed URL still works.
- **`RESTRICTED_RATINGS` (`q`, `e`) is a search-engine policy**, not a viewer one — out of
  `sitemap.xml`, `noindex` on the page. Nothing is hidden from a visitor.
- The column is free-form text with no check constraint, so a new tier is a code change
  only.

## Images

- **Buckets are `posts` and `post-thumbnails`.** Paths derive from `posts.file_name`
  (the md5 of the uploaded bytes), never stored.
- **Both encoders are lossy AVIF at quality 50** (`@common/imgcmp/`). The thumbnail is
  384px tall, width capped at 768 for panoramas, `mitchell` kernel — the grid scales by
  row height, so height is the bound that matters. `THUMB_MAX_HEIGHT` and the grid's
  `MAX_ROW × --row-h` are one decision and must move together. The post image is kept only when it
  beats the uploaded bytes, otherwise the original is stored byte-for-byte. Lossless was
  measured and rejected on size (3.6MB from a 1.9MB JPEG).
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

Two rewrites were run by hand against the live project rather than as migrations, the
columns being free-form: the rating scale (`general, e1..e5` → four names → the letters)
and `posts.md5` → `posts.file_name`. Saved queries and desktop tag rules holding an old
spelling were left to rot on purpose — `asRating` returns null for one, so it degrades to
a tag that matches nothing.

There are no accounts and no role tier: anyone with a build of the desktop app can do
everything, everyone else can read. Public accounts would mean re-adding Supabase Auth, a
`profiles` table and write policies, in that order; git has all three.

## Docs

[docs/architecture.md](docs/architecture.md) and
[docs/database-schema.md](docs/database-schema.md), plus `design/` (one screenshot of the
interface as drawn). Each package has a README of its own. There is no roadmap, no status
page and no runbook: a live project needs the environment file and `npm run db:push`, and
the reasoning behind a decision lives in this file and beside the code it explains.

Docs lag the build. When they disagree with `src/` or `supabase/migrations/`, the code
wins — and fix the line you tripped over.
