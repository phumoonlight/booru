# Pubooru Desktop (`desktop`)

The website's upload page and everything else that writes to the board, as a desktop app.
The site itself is read-only.

## Why it exists

Uploading a post is mostly image compression: a lossy AVIF thumbnail plus a lossy AVIF
attempt at the full image, and a PNG re-deflate when AVIF loses. That is seconds of
CPU per file, which is the one thing a free serverless tier is worst at — Vercel bills it
by the second and kills the function at ten, so the website had to refuse anything over
4MB or 20 megapixels before it even started. Its upload page is gone entirely now.

Run the same code on your own machine and those ceilings are someone else's problem.
Here a file may be **50MB and 100MP**, and nothing is on a clock
([`src/main/limits.ts`](src/main/limits.ts)).

It has since become the only way to change the board at all. Managing posts and tags left
the website when the board dropped its accounts, so this app also **browses** the board
with the same query grammar the site uses, edits and deletes what it finds, and manages
the tag vocabulary.

What it does not do is take the whole machine while it works. libvips spreads one encode
across every core it can see, which on a 16-core desktop is 100% CPU for as long as a
large image takes, and everything else on the desk stutters. So the app encodes on half
the cores at below-normal priority by default — both adjustable under Compression in
settings. Neither knob touches `effort`, so nothing is traded away: fewer threads is the
same picture at the same settings, a little slower and (aom tiles being what they are) a
shade smaller. The measurements are in [`src/main/cpu.ts`](src/main/cpu.ts).

Everything else is identical, because it is literally the same code: the upload pipeline,
the post write path, the tag queries and both image compressors are compiled straight out
of `../common/src` through the `@common` alias. There is no second definition of what a
post is.

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
and it is how a finished post gets opened on the board.

`DATABASE_URL_APP` is `booru_app`, not the website's `booru_web` and not the migration
runner's `booru_owner`: it reads and writes every row and may not create, alter or drop
anything. That is what keeps a bundle somebody extracts the string from at "can vandalise
the data" rather than "can drop the schema" — see `db/README.md`.

Which board a copy talks to is therefore decided when it is built, not by whoever runs
it. There is no setup screen and no login: the app opens on the upload form, and
Settings shows the database host and the image origin as a readout, never a credential.
Earlier versions asked for those values on first launch and kept them in `save.json`,
which put the board's writing credential on every machine that ran the app — a copy this
version deletes on startup if it finds one.

`save.json` now holds the compression preferences and the tag catalogs, and nothing else,
as plain readable text — the catalogs being a `{ name: [tag, …] }` object worth opening the
file for once there are more of them than you want to type in one at a time. The two sets
of tag rules were in here too until they moved onto the board's `tag_rules` table, where a
rule follows the tag it names through a rename and every install has the same ones. `desktop:dev` uses a folder of its own (`pubooru-desktop-dev` beside
`pubooru-desktop`), so working on the app never disturbs the copy you use, and both can
be open at once.

**There is nothing to sign in to.** The board has no accounts: nothing on the site ever
showed who uploaded what, and this bundle already carried the service-role key, so the
password stood in front of a door it was not the lock for. What guards the board now is
the schema — every table has a select policy and no write policy, so the anon key the
website holds can only read — and the fact that this key exists only in a build you made
for your own board. Treat the installer accordingly: anyone who has it can write.

## How it is put together

| | |
|---|---|
| `src/main` | the process that does the work — clients, config, staging, the IPC handlers |
| `src/preload` | the bridge; the only thing the window can reach |
| `src/renderer` | the React window: the upload form, browse, tags (and their rules), settings, about |
| `src/shared/api.ts` | the types across the bridge, imported by all three |
| `src/renderer/src/board-store.ts` | which of the two boards the window is working on — the header's switch |
| `src/shared/implications.ts` | rules the app applies: what they are, and the pure code that applies them |
| `src/shared/recommendations.ts` | rules the app only offers, same shape |

| `src/main/rules.ts` | reads and writes both sets on the board — `@common/data/rules.ts` underneath |
| `src/main/form-sections.ts` | the rows the tag form draws, their order, and what each waits for |
| `src/shared/catalogs.ts` | named sets of tags, applied when asked for by name |

The renderer holds no keys, no file access and no network. Every capability it has is one
`ipcMain.handle` in [`src/main/ipc.ts`](src/main/ipc.ts) — including reading the file it
is about to upload, which never crosses the bridge as bytes.

**Two boards, one window.** The header's switch picks the gallery or the generated images,
and it decides where an upload lands, what Browse lists, what the editor edits and which
count the Tags grid draws. The board is the renderer's state and travels with every call
rather than being a mode in main: a mode there is read before every `await` in a handler,
so an upload begun on one board and finished after the switch was flipped would land on the
other. `@common/board` holds the table names it resolves to.

One client: the service role, built from the key compiled into the main bundle. It was
two — a session for the post row and the service role for storage and the counters — back
when the board had accounts and `posts.uploader_id`.

Thumbnails on the browse screen come across the bridge as `data:` URLs rather than being
fetched by the page. The window's CSP is `img-src 'self' data:` and a grid is not worth
being the reason that stops being true; `src/main/manage.ts` caches them by md5, which
can never go stale.

## Notes

- Tag autocomplete does not query per keystroke: `src/main/tag-cache.ts` keeps the board's
  tag list in `tag-cache.json` for a day and prefix-matches it in memory. It is dropped
  after every upload, by 🔄 on the Tags screen, and by Clear cache in settings.
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
