# Pubooru Desktop (`desktop`)

The website's upload page, as a desktop app.

## Why it exists

Uploading a post is mostly image compression: a lossy AVIF thumbnail plus a lossless
AVIF attempt at the full image, and a PNG re-deflate when AVIF loses. That is seconds of
CPU per file, which is the one thing a free serverless tier is worst at — Vercel bills it
by the second and kills the function at ten, so the web has to refuse anything over 4MB
or 20 megapixels before it even starts (`src/lib/upload-limits.ts`).

Run the same code on your own machine and those ceilings are someone else's problem.
Here a file may be **50MB and 100MP**, and nothing is on a clock
([`src/main/limits.ts`](src/main/limits.ts)).

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
npm run desktop:package    # builds an installer into packages/desktop/dist
```

`desktop:package` empties `dist/` and `out/` first. The installer is named for the
version, so without that the folder just accumulates one file per release you ever built
and the newest is only obvious if you read the numbers.

Both read the repo's own environment file and **require all four values** —
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
and `NEXT_PUBLIC_SITE_URL` (see `.env.example`). A missing one fails the build and names
what is missing, rather than producing an installer that cannot reach anything. The
website treats the site URL as optional because Vercel supplies a deployment URL to fall
back on; nothing here does, and it is how a finished post gets opened on the board.

Which board a copy talks to is therefore decided when it is built, not by whoever runs
it. There is no setup screen: the app opens on a login form, and Settings shows the
project it was built for as a readout. Earlier versions asked for those four values on
first launch and kept them in `save.json`, which put a service-role key on every machine
that ran the app — a copy this version deletes on startup if it finds one.

What is still in `save.json` is the session, the "remember me" credentials and the
compression preferences, as plain readable text. `desktop:dev` uses a folder of its own
(`pubooru-desktop-dev` beside `pubooru-desktop`), so working on the app never disturbs
the copy you use, and both can be open at once.

Sign in with an existing account. There is no signup here any more than there is on the
website.

## How it is put together

| | |
|---|---|
| `src/main` | the process that does the work — clients, config, staging, the IPC handlers |
| `src/preload` | the bridge; the only thing the window can reach |
| `src/renderer` | the React window: settings, login, the upload queue |
| `src/shared/api.ts` | the types across the bridge, imported by all three |

The renderer holds no keys, no file access and no network. Every capability it has is one
`ipcMain.handle` in [`src/main/ipc.ts`](src/main/ipc.ts) — including reading the file it
is about to upload, which never crosses the bridge as bytes.

Two clients, the same split the web runs on: the signed-in session writes the post row
(so `uploader_id` is right and RLS applies), and the service role writes the storage
objects and the denormalized counters — the rows no user session is allowed to set.

## Notes

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
- Releases get a file each in [`changelog/`](changelog/), named for the version; the
  number there, in `package.json` and on the About screen are the same number.
