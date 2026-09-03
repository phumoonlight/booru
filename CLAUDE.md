@AGENTS.md

# Pubooru

A booru-style image board (Danbooru is the reference): tag-centric gallery, multi-tag
search with negation, post detail pages, uploads by any signed-in user. Fullstack
Next.js 16 App Router + Supabase (Postgres, Storage, Auth), Tailwind v4, mobile-first.

## Replies

- Be extremely concise. Lead directly with the result or fix.
- Omit all conversational preambles, narration, and filler phrases.
- Do not explain code changes unless explicitly asked.
- Link files (`[file.ts:42](src/file.ts#L42)`) instead of pasting code back.
- Full length only for errors, failing output, security notes, and confirmations before
  something destructive.

## Commands

| | |
|---|---|
| `npm run dev` / `build` / `lint` | the only verification the repo has — there is no test runner |
| `npm run db:push` / `db:push:dry` | apply migrations to the linked Supabase project |
| `npm run db:list` / `db:reset` / `db:reset:remote` | migration status / local reset / reset the linked project |
| `npm run desktop:dev` / `desktop:package` | the desktop uploader — window, or installer. Both need the four env values |
| `npm run typecheck -w desktop` | the only check the Electron app has; the root `tsc` excludes `packages/` |
| `npm run bench:avif` | sweeps sharp's AVIF `effort` over `tests/static/` — sizes and encode times |

Ad-hoc checks (query parser, rating resolution) have been run as throwaway scripts in
the scratchpad, never committed. `tests/` is not a suite and there is no runner — it is
the AVIF bench and its sample image, kept only because the numbers behind `lib/imgcmp/`
are worth being able to re-measure. Keep it that way unless asked for a test setup.

## Git

**Commit on `main`. Do not create a branch unless asked for one.** This is a solo repo
with a linear history; a branch per change just adds a merge step the author then has
to undo. When a branch is genuinely wanted, the author will say so.

Commit only when asked. Never push unless asked.

## Layering — do not cross these lines

- **Reads:** RSC → `src/lib/data/*` → Supabase server client (anon key, RLS enforced).
  Never call Supabase from a page or component directly. The one read that isn't an RSC
  is `loadMorePosts` in `lib/actions/search.ts` — the feed's next chunk, an action rather
  than a route handler so `lib/data/search.ts` stays the only query surface. It takes no
  `requireUser()`: it can return nothing a visitor couldn't reach by editing the URL.
- **Writes:** `'use server'` actions in `src/lib/actions/*` → `requireUser()` first →
  zod parse → `src/lib/data/*`. RLS (`auth.uid() is not null`) is the real guard;
  `requireUser()` exists to fail loudly rather than update zero rows.
- **Pure helpers** (`lib/search.ts`, `lib/tags.ts`, `lib/storage.ts`, `lib/site.ts`)
  import nothing server-side, so client components can share them.
- Query logic stays in `lib/data/` and out of actions/pages so the deferred public API
  can reuse it verbatim (docs/future.md §2).
- **Anything two front ends share takes its clients as arguments.** `lib/data/shared.ts`
  (post write path, `ensureTagIds`, tag-name search), `lib/data/counters.ts` and
  `lib/upload/pipeline.ts` never call `createClient()` — the caller passes
  `(supabase, admin)`. That is what lets `packages/desktop` run them: `supabase/server.ts`
  imports `next/headers` and `admin.ts` is `server-only`, so a module that builds its own
  client can only run inside Next. `lib/data/posts.ts` and `tags.ts` wrap them with the
  request-scoped clients, so no call site in `src/` sees the difference. Don't "simplify"
  a client parameter away.
- Four Supabase clients, each with one job: `server.ts` (cookies, request-scoped),
  `client.ts` (browser), `anon.ts` (cookie-less, for cacheable routes like the sitemap),
  `admin.ts` (service role — never reaches the browser; storage writes/deletes,
  `incrementPostView()` — the one row write an anonymous visitor is allowed to cause —
  and the counter syncs in `lib/data/counters.ts`, whose rows no user session may set).

## The desktop uploader (`packages/desktop`)

The repo is an npm workspace and Electron is the only member. It is the upload page as a
desktop app, and it exists because compression is CPU work a free serverless tier is bad
at — see [packages/desktop/README.md](packages/desktop/README.md).

- **It imports the web's `src/`, it does not copy it** (`@web/*` → `../../src/*`, and
  `@/*` too because the files over there spell each other that way). The pipeline, the
  write path, both compressors and the pure helpers are one definition. One catch, in
  `renderer/src/styles.css`: Tailwind finds class names by *reading files*, and the
  renderer scans only its own tree, so a web module that holds classes — `CATEGORY_COLOR`
  in `lib/tags.ts` — has to be named in an `@source` there or it compiles to nothing and
  the colour silently disappears. Import a web module with classes in it, add the
  `@source` line.
- **Its limits are its own** (`src/main/limits.ts`, 50MB / 100MP). `MAX_FILE_SIZE` and
  `MAX_PIXELS` in `lib/upload-limits.ts` are Vercel's numbers and stay Vercel's.
- Session client writes the post row, service role does storage and the counters — the
  same split as the web, spelled in `createPostFromImage`'s signature.
- The renderer has no keys, no Node and no network: every capability is one
  `ipcMain.handle` in `src/main/ipc.ts`, and the file's bytes are read on the main side.
- **It is a good neighbour on purpose** (`main/cpu.ts`). libvips spreads one encode across
  every core, so an upload used to pin a 16-core machine flat. Two settings now bound it:
  `sharp.concurrency()` from `encodeThreads` (half the cores by default) and the process's
  scheduling priority from `encodePriority` (below normal by default, `low`/`normal`
  offered). Neither is `effort`: thread count, priority and compression settings are
  independent, and the measured table in that file shows fewer threads coming out
  *smaller* (fewer aom tiles), costing only wall time. Both are applied before the first
  encode can start and re-applied on save, since both are process-wide — with one
  exception noted there: a POSIX host won't let a niced-down process raise itself back,
  so low → normal takes a restart. Windows, which this app is packaged for, will.
- **Which board it talks to is compiled in, not typed in.** `electron.vite.config.ts`
  reads the repo's environment file at build time and `define`s the four values into the
  main bundle — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SITE_URL`, all four **required**, the
  build throwing with the missing names rather than shipping an installer that reaches
  nothing. The site URL is optional for the website (Vercel supplies a fallback) and is
  not here: it is how a finished post gets opened. `main/config.ts` reads that one
  `__BUILD_ENV__` and nothing else; only the main bundle gets the `define`, so no key is
  ever compiled into a file the window loads. This replaced a four-box setup screen whose
  cost was a service-role key in a plain file on every machine that ran the app, and an
  installer nobody could tell the target of — `dropStoredConfig()` deletes that stored
  copy on startup. A build is now made *for* a board and asks only for a login.
- **`save.json` holds preferences, session and credentials.** `main/save-file.ts` keeps
  everything the app remembers in one readable file in the app's userData. It was three
  files sealed with Electron's `safeStorage`; the encryption was dropped deliberately, in
  exchange for a file that can be read, hand-edited and copied — the remembered password
  and the session token are what plain text now costs, the service-role key having moved
  into the bundle. `userData` is pinned in `main/index.ts` rather than defaulting to the
  app's display name, so renaming the app doesn't move the settings — `pubooru-desktop`
  packaged, `pubooru-desktop-dev` in a checkout, so `npm run desktop:dev` can't sign out
  the copy you actually use (and the split lock lets both run at once). A file that won't
  parse is treated as absent, costing a re-login and never a crash.
- **The settings screen is a readout plus two settings.** Connection shows the project
  and board URLs the build carries — never the keys, which are neither editable nor worth
  the risk on screen — and says so. Compression is the only editable part: encoder threads
  as a `<Field />` you type into, priority as a `<Choice />` with no Edit step since the
  options are already on screen. `main/preferences.ts` owns that `preferences` section and
  applies as it writes, so a change takes the next image rather than the next launch.
  Unconfigured — which the build refuses to produce — the same screen is forced open and
  names the four missing variables instead of letting a Supabase call fail opaquely.
- **Four views, one of them always mounted** — plus one header item that is not a view.
  `App.tsx` holds `'upload' | 'tags' | 'settings' | 'about'` and the header switches
  those, with the login form in front until there is a session (and settings in front of
  that only for a bundle built with no project). **Posts** is the item that is not a
  view: it opens the board's gallery in the browser — `searchHref('')`, since that helper
  is the only thing allowed to spell the listing's path — and is never drawn active,
  because it goes somewhere else. About is the exception to the screen order, since "what
  version is this" is a fair question before signing in, and it carries the versions
  `app:status` reports: the renderer has no `process`, and a packaged app ships no
  manifest it could read. Tags is not an exception — it reads the board, so it sits behind
  the session with the queue, runs `listTags` from `lib/data/shared.ts` (the web's /tags
  page runs the same one) and opens a tag on the board rather than here, there being no
  gallery in this window to show it in. Its list is **cached in a module-level `let`**
  rather than in state, because the view is unmounted whenever something is in front of
  it and every glance was re-reading every tag on the board: 🔄 by the title re-reads on
  request, the time of the last read sits beside it, and `invalidateTags()` drops the copy
  when an upload lands — the one moment it is certainly wrong. The queue is **hidden, not
  unmounted**, when another view is in front: glancing at About used to throw away a
  staged, half-tagged queue and orphan an upload already in flight.
- **It resolves like a browser, not like the host** (`main/dns.ts`). Every open-web fetch
  it makes is an address dragged out of a browser, and a browser on DoH will happily show
  an image the machine's own resolver answers NXDOMAIN for. `configureHostResolver` names
  Google and Cloudflare in `secure` mode — `automatic` only upgrades when the *system's*
  provider speaks DoH, which is never true on the networks this is for. It reaches only
  Chromium's stack (the drag downloads); Supabase goes over Node's `fetch` and the OS
  resolver, which is what makes a DoH-only setting safe to make.
- **`signOut({ scope: 'local' })`, here and in `lib/actions/auth.ts`.** The default is
  `'global'`, which revokes every refresh token the account holds — logging out of the
  uploader signed out the browser too, and the other way round. Logging out of one place
  means one place.
- **Releases are a file each in `packages/desktop/changelog/`, named for the version.**
  Bumping `package.json` and writing that file are the same change — About reads the
  version, so drift makes the app lie about itself. Keep entries **short**: a heading
  line, then `### Added` / `### Changed` / `### Fixed` bullets of one or two lines each,
  written as what a user of the app would notice. The reasoning belongs in the commit and
  beside the code, not here — a changelog nobody can skim is one nobody reads.

## Database

- **The schema is six files: storage, then one per table.** `20260826090000_storage_buckets.sql`,
  then `profiles` → `posts` → `tags` → `post_tags` → `rating_counts` in foreign-key
  order. Each table's file holds its columns, indexes **and** RLS policies, so nothing
  about a table is spread across migrations. The eighteen migrations from the build were
  squashed into these before the first deployment. Schema changes from here are
  **always** a new timestamped file, never a dashboard edit and never an edit to the
  squashed six once they have been pushed anywhere real.
- SQL functions holding query logic are gone: search, the post writes, the view counter
  and the two counter triggers all moved into TypeScript, because a plpgsql body needs a
  migration to edit and reports one opaque error, from inside a statement that was about
  something else. What remains in SQL is `handle_new_user()`, which fires on
  `auth.users`, and `EXECUTE` on it is revoked from `anon` and `authenticated` so nothing
  definer-rights is reachable over `/rest/v1/rpc`. Don't add RPCs back without a reason
  PostgREST genuinely can't meet.
- Denormalized counters (`tags.post_count`, `rating_counts.post_count`) are maintained by
  `lib/data/counters.ts`, not by triggers. They **recompute** — PostgREST can't increment,
  and an increment that loses a race is wrong for good — so every write must call
  `syncTagPostCounts` / `syncRatingCounts` with the tags and ratings it moved. They write
  on the service role (`rating_counts` has no write policy at all — the guard is the
  action's `requireUser()`), and they log rather than throw: the post write has already
  landed by then.
- `createPostWithTags()` has no transaction — it deletes the post it just inserted if
  tagging fails, via `deletePostRow()` (which reads the post's tag links before the
  cascade eats them, so the counts come back down). Preserve that unwind if you touch
  the write path.

## Things the code decided that are easy to get wrong

- **`src/proxy.ts`, not `middleware.ts`** — Next 16 renamed the convention. It only
  refreshes the session; it guards no routes. Pages check the session themselves.
- **Nothing on the web links to `/upload` any more.** The page and the action still work
  and the route still answers, but the header's link is gone: compression is seconds of
  CPU, Vercel's free tier bills that by the second and kills the function at ten, so an
  entry point on every page advertises the one thing this deployment does badly. Uploading
  is the desktop app's job. Don't put the link back without a runtime that can hold it.
- **The gallery is `/posts`, not `/`** — `/` is a landing page (wordmark, search box,
  emoji post count). `searchHref()` in `lib/search.ts` is the only place that spells the
  listing's path, so tag links, facets and the feed's own links all derive from it;
  `/?query=` redirects there for old links.
- **`?query=` is the only param the listing has** (`SEARCH_PARAM` in `lib/search.ts`),
  space-separated, `-tag` excludes. Ratings and the feed's cursor ride in the same
  string as `rating:e3` and `start:900` metatags — nothing outside `splitQuery` and
  `resolveRatings` needs to know they exist, and the search bar renders every one of
  them as a chip you can clear. A saved query is therefore just that string.
- **The listing is a feed, and there are no page numbers.** `PostFeed` renders the
  server's screenful, then appends chunks by cursor (`id < lastId`) — never by offset,
  which slides when an upload lands mid-scroll. Three things about it are load-bearing:
  the "load more" control is a real `<a href="?query=… start:N">` with its click
  intercepted, because a feed that renders no link puts everything past the first chunk
  out of reach of crawlers and of a browser whose JS hasn't arrived; each chunk keeps its
  own `<ul>` so a landing chunk can't reflow rows you already scrolled past; and
  `replaceState` keeps the cursor in the URL so a refresh doesn't drop you at the top.
  Cards open in a **new tab** for the same reason — following one in place threw the
  loaded chunks away. Nothing counts rows any more: `hasMore` is one row read past the
  chunk, and `count: 'exact'` scanned the filtered set on every read to feed a page
  number that no longer exists.
- **`/tags/[id]` is a sample, not a listing** — ten posts, up to fifty, then a link into
  the gallery. It has no search box, no facets and no cursor on purpose: browsing a tag
  to its end is what `/posts?query=<tag>` is for, and that page has all three.
- **Rating scale is `general, e1, e2, e3, e4, e5`.** `RESTRICTED_RATINGS` (e3–e5) means
  "kept out of sitemap.xml and search results" only — nothing is hidden from a visitor.
  Column is free-form text — no check constraint, so a new tier is a code change only.
- **Buckets are `posts` and `post-thumbnails`**, both AVIF-era: thumbnails are lossy AVIF
  (400px tall, width capped at 800 for panoramas, `mitchell` kernel — the grid scales by
  row height, so height is the bound that matters), the post image is lossless AVIF only
  when it beats the uploaded bytes, otherwise the original byte-for-byte. Paths derive
  from md5, never stored.
- **MD5 is the dedup key on purpose** — collision resistance is not what it's for.
- **The two encoders live in `lib/imgcmp/`, not in the upload action.** `for-post.ts` and
  `for-thumbnail.ts` take a buffer and hand back a candidate, so the upload action, the
  pipeline and the desktop app share one encode. The constants in there are measured, not
  chosen — re-measure with `npm run bench:avif` before changing one.
- **Nothing goes through the Next optimizer.** Both the grid thumb and the detail image
  are `unoptimized`, so the stored file is served untouched (animation intact, no
  re-encode). The grid used to be optimized and it was visibly softening thumbnails:
  Next scales the requested quality by 50/80 for AVIF, so the default 75 became an AVIF
  quality of 47 at effort 3 — a second lossy pass over an already-lossy thumbnail, for
  a resize it could not perform anyway (its optimizer sets `withoutEnlargement`).
- `view_count` is bumped only by the `recordPostView` action from the browser, never on a
  read path — prefetches, `generateMetadata` and crawlers must not inflate it.
- Rating blur is a `data-blur-ratings` attribute on `<html>` set before first paint, so
  the grid stays a plain server render (`lib/rating-blur.ts` + `globals.css`).
- Saved queries are `localStorage` too, so they need no account (`lib/saved-queries.ts`,
  module store in `use-saved-queries.ts` — the sidebar renders twice and both copies have
  to agree). A row's identity is its tags, the query minus `start:`, which is what lets
  💾 move a saved cursor without a second row and without any selection state.
- `MAX_FILE_SIZE` lives in `lib/upload-limits.ts` because three layers must agree:
  the drop zone, the upload action, and `serverActions.bodySizeLimit` in `next.config.ts`.
- Pages fall back to `<SetupNotice />` when `isSupabaseConfigured()` is false, so the app
  is browsable before `.env.local` has been filled in.

## Style

- Prettier (`.prettierrc`): no semicolons, single quotes, 100 cols, 2 spaces. Run nothing —
  match the surrounding file.
- Comments explain *why*, in prose, and are common in this codebase — the measured
  trade-off, the failure that motivated the choice. Match that register; don't narrate
  what the code already says.
- No component library. Plain Tailwind against the CSS variables in `globals.css`
  (`background`, `surface`, `border`, `muted`, `accent`). Dark theme only.
- Mobile-first: design at 375px, scale up with `sm:`/`md:`/`lg:`. 44px tap targets.
- No role tier exists — any signed-in account can upload, edit and delete. Public signup
  therefore needs a privilege tier first (docs/future.md §1).

## Docs

`architecture.md`, `database-schema.md` and `future.md`, plus `design/` (one screenshot
of the interface as drawn). There is no status page and no runbook: a live project needs
`.env.local` and `npm run db:push`, and the reasoning behind a decision lives in this
file and in the comment beside the code it explains.

They are written from the shape of the build and lag behind it — the relics that had
piled up (shadcn/ui, WebP thumbs, `originals`/`thumbnails`, the old
`general/sensitive/questionable/explicit` scale, `?tags=`) have been cleared out, but
more will accumulate. When they disagree with `src/` or `supabase/migrations/`, the code
wins — and fix the doc line you tripped over.
