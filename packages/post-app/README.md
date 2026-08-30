# Pubooru Desktop (`post-app`)

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

Everything else is identical, because it is literally the same code: the upload pipeline,
the post write path, the tag queries and both image compressors are compiled straight out
of `../../src` through the `@web` alias. There is no second definition of what a post is.

## Running it

From the repo root:

```
npm run post-app:dev        # opens the window with hot reload
npm run post-app:package    # builds an installer into packages/post-app/dist
```

On first launch the app asks which board it uploads to — project URL, anon key, service
role key, and optionally the site's address so a finished post can be opened in your
browser. A checkout is no different: it reads no environment and no `.env.local`, so the
setup screen every installed copy meets is the one development runs too.
They are kept in `save.json` in the app's data folder, as plain readable text — service
role key included, so treat that folder as the secret it is.

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

- `npm run typecheck -w post-app` checks all three sides. The root `tsconfig.json`
  excludes `packages/`, so `npx tsc` at the root does not.
- `sharp` is a native module and is unpacked from the asar at package time. Its prebuilds
  are Node-API, so there is nothing to rebuild against Electron — hence `npmRebuild: false`
  in [`electron-builder.yml`](electron-builder.yml).
- `electron` is pinned to an exact version, not a range. electron-builder downloads the
  prebuilt runtime for one specific release and refuses to guess which; a caret here
  fails packaging with "version is a range, not a fixed version".
- No icon is configured, so a packaged build wears Electron's. Drop one in `build/` and
  point `electron-builder.yml` at it when that matters.
