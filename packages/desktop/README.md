# Pubooru Desktop (`desktop`)

Everything that writes to the board, as a desktop app: the shelves the website shows, the
artist reading list, the tag vocabulary and the site's maintenance switch. The site itself
is read-only.

## Why it exists

Putting an image on a shelf is mostly image compression: a lossy AVIF thumbnail plus a
lossy AVIF attempt at the full image, kept only when it beats the uploaded bytes. That is
seconds of CPU per file, which is the one thing a free serverless tier is worst at — Vercel
bills it by the second and kills the function at ten, so the website could never take a
large file at all.

Run the same code on your own machine and those ceilings are someone else's problem.
Here a file may be **50MB and 100MP**, and nothing is on a clock
([`src/main/limits.ts`](src/main/limits.ts)).

It is also the only way to change the board at all. The website holds a role that may read
and bump a view counter, so naming a shelf, filling it, moving an image between shelves,
keeping the artist list and editing the tags all happen here.

What it does not do is take the whole machine while it works. libvips spreads one encode
across every core it can see, which on a 16-core desktop is 100% CPU for as long as a
large image takes, and everything else on the desk stutters. So the app encodes on half
the cores at below-normal priority by default — both adjustable under Compression in
settings. Neither knob touches `effort`, so nothing is traded away: fewer threads is the
same picture at the same settings, a little slower and (aom tiles being what they are) a
shade smaller. The measurements are in [`src/main/cpu.ts`](src/main/cpu.ts).

Everything else is identical, because it is literally the same code: the upload pipeline,
the collection and tag queries and both image compressors are compiled straight out of
`../common/src` through the `@common` alias.

## Running it

From the repo root:

```
npm run desktop:dev        # opens the window with hot reload
npm run desktop:package    # builds an installer into the repo root's dist/
```

The installer lands at the top of the repo rather than three folders down beside the
source it was built from — it is the one thing here somebody goes looking for by hand.

`desktop:package` empties that `dist/` and this package's `out/` first. The installer is named for the
version, so without that the folder just accumulates one file per release you ever built
and the newest is only obvious if you read the numbers.

Both read the repo's own environment file and **require seven values** —
`DATABASE_URL_APP`, `NEXT_PUBLIC_CDN_URL`, `NEXT_PUBLIC_SITE_URL` and the four `R2_*`
(see `.env.example`). A missing one fails the build and names what is missing, rather
than producing an installer that cannot reach anything. The website treats the site URL
as optional because Vercel supplies a deployment URL to fall back on; nothing here does,
and it is how a shelf or an image gets opened on the site.

`DATABASE_URL_APP` is `booru_app`, not the website's `booru_web` and not the migration
runner's `booru_owner`: it reads and writes every row and may not create, alter or drop
anything. That is what keeps a bundle somebody extracts the string from at "can vandalise
the data" rather than "can drop the schema" — see `db/README.md`.

Which board a copy talks to is therefore decided when it is built, not by whoever runs
it. There is no setup screen and no login: the app opens on 🗂️ Collections, and Settings
shows the database host and the image origin as a readout, never a credential. Earlier
versions asked for those values on first launch and kept them in `save.json`, which put the
board's writing credential on every machine that ran the app — a copy this version deletes
on startup if it finds one.

`save.json` now holds the compression preferences and nothing else, as plain readable
text. The two sets of tag rules were in here until they moved onto the board's `tag_rules`
table, where a rule follows the tag it names through a rename and every install has the
same ones. `desktop:dev` uses a folder of its own (`pubooru-desktop-dev` beside
`pubooru-desktop`), so working on the app never disturbs the copy you use, and both can
be open at once.

**There is nothing to sign in to.** The board has no accounts. What guards it is the
roles: the website's login may only read, and the writing login exists only in a build
you made for your own board. Treat the installer accordingly: anyone who has it can write.

## How it is put together

| | |
|---|---|
| `src/main` | the process that does the work — clients, config, staging, the IPC handlers |
| `src/preload` | the bridge; the only thing the window can reach |
| `src/renderer` | the React window: collections, artists, tags (and their rules and sections), settings, about |
| `src/shared/api.ts` | the types across the bridge, imported by all three |
| `src/shared/implications.ts` | the implication rules' shape, and the parse main stores them through |
| `src/shared/recommendations.ts` | the recommendation rules, same shape |
| `src/main/rules.ts` | reads and writes both sets on the board — `@common/data/rules.ts` underneath |
| `src/main/form-sections.ts` | the rows of the tag form, their order, and what each waits for |
| `src/main/collections.ts` | the shelves: name one, edit it, delete an empty one, add images, correct, move or remove one |
| `src/renderer/src/components/collections.tsx` | 🗂️ Collections — the shelf list and one shelf open |
| `src/main/artists.ts` | the artist list: name one, links, example images, mark read, delete with its images |
| `src/renderer/src/components/artists.tsx` | 🎨 Artists — never-read first, oldest read to newest; Mark read is held, not clicked |

The renderer holds no keys, no file access and no network. Every capability it has is one
`ipcMain.handle` in [`src/main/ipc.ts`](src/main/ipc.ts) — including reading the file it
is about to upload, which never crosses the bridge as bytes.

**The shelves are the site.** Every post and AI post was moved onto a collection (migration
0012), and with the two boards went this app's Upload screen, Browse screen, post editor
and the header's board switch. A shelf carries a name, a mark, a rating that every image on
it takes, and a 🤖 AI flag the website filters on; an image carries only its source. Adding
images is a batch of files and one source. `@common/collections` is what the screen
resolves its two table names and two object prefixes out of.

**The tag vocabulary is kept for a later use.** Nothing carries a tag any more, so the Tags
screen has no counts and no Apply by tag, but naming, filing, rules and the rule map all
still work against the board.

Thumbnails come across the bridge as `data:` URLs rather than being fetched by the page.
The window's CSP is `img-src 'self' data:` and a grid is not worth being the reason that
stops being true; `src/main/thumb-cache.ts` caches them by md5, in memory and on disk,
which can never go stale.

## Notes

- Nothing about collections is cached but their thumbnails. A shelf list is a handful of
  rows read when the screen opens, and a cache would be a second thing that can be wrong
  about a name you just changed.
- `src/main/tag-cache.ts` keeps the board's tag list in `app-cache/tags.json` for a day. It
  is dropped by every write to a tag, by 🔄 on the Tags screen, and by Clear cache in
  settings.
- `npm run typecheck -w desktop` checks all three sides. The root `tsconfig.json`
  excludes `packages/`, so `npx tsc` at the root does not.
- `sharp` is a native module and is unpacked from the asar at package time. Its prebuilds
  are Node-API, so there is nothing to rebuild against Electron — hence `npmRebuild: false`
  in [`electron-builder.yml`](electron-builder.yml).
- `electron` is pinned to an exact version, not a range. electron-builder downloads the
  prebuilt runtime for one specific release and refuses to guess which; a caret here
  fails packaging with "version is a range, not a fixed version".
- The installer's icon is `build/icon.ico`, named in [`electron-builder.yml`](electron-builder.yml).
  Without one a packaged build wears Electron's.
- Every change here raises the version in [`package.json`](package.json). About shows it
  and electron-builder stamps it on the installer, so a build that was not bumped looks
  exactly like the one before it.
