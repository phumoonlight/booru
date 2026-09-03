# common

The code the website and the desktop uploader both compile. Not a copy of either: there
is one definition of what a post is, one of how an image is squeezed, and both front ends
import it from here.

It exists because two apps create posts. The website does it from a server action; the
desktop uploader (`packages/desktop`) does it from a file on disk, because compression is
CPU work a free serverless tier is bad at. Everything they must agree on — the write path,
the encoders, the search grammar, the tag rules — is in this directory, and neither of
them owns it.

Before this package the desktop app reached into the Next app's `src/` through an `@web`
alias, plus an `@/` alias only because the files over there spell each other that way.
That worked, but it made the website's internal layout part of the desktop build, and
left "is this file shared?" a question you answered by grepping. Now it is answered by
where the file is.

## What's in here

| | |
|---|---|
| `search.ts` | the `?query=` grammar — `splitQuery`, `searchHref`, the rating metatags, `RESTRICTED_RATINGS` |
| `tags.ts` | tag parsing and the charset, `CATEGORY_COLOR` |
| `storage.ts` | bucket names and the md5-derived image paths |
| `supabase/types.ts` | `BooruClient`, the client type every function here takes |
| `data/shared.ts` | the post write path, `ensureTagIds`, tag-name search, `listTags` |
| `data/counters.ts` | `syncTagPostCounts` / `syncRatingCounts` — recompute, never increment |
| `imgcmp/for-post.ts` | lossless AVIF for the stored image, bounded to `POST_MAX_DIMENSION` |
| `imgcmp/for-thumbnail.ts` | lossy AVIF thumbnail, 400px tall |
| `upload/pipeline.ts` | `createPostFromImage` — one image in, one post out, unwound on failure |

## The rules that keep it shareable

- **Nothing here builds a Supabase client.** The caller passes `(supabase, admin)`. The
  web's `supabase/server.ts` imports `next/headers` and `admin.ts` is `server-only`, so a
  module that built its own client could only ever run inside Next. This is the one
  constraint the whole package rests on — don't "simplify" a client parameter away.
- **No `next/*`, no `server-only`, no React.** Electron's main process compiles these
  files and has none of it.
- **No environment reads and no limits.** Ceilings are a property of where the code runs:
  Vercel's are in `src/lib/upload-limits.ts`, the desktop's in
  `packages/desktop/src/main/limits.ts`, and `createPostFromImage` takes them as an
  argument.
- **`search.ts`, `tags.ts` and `storage.ts` stay pure**, so client components can import
  them.

## How it resolves

`@common/*` in both programs — a tsconfig `paths` mapping, no build step and nothing
published. The web maps it in the root `tsconfig.json` (Next reads those paths itself);
the desktop maps it in `packages/desktop/tsconfig.json` and again as a Vite alias in
`electron.vite.config.ts`, since the type checker and the bundler each need telling.

Files in here import each other by `@common/…` too, so a module reads the same wherever
it is compiled.

One catch, and it is not a TypeScript one: Tailwind finds class names by **reading
files**. `CATEGORY_COLOR` in `tags.ts` holds classes, and the desktop renderer scans only
its own tree, so that file is named in an `@source` line in
`packages/desktop/src/renderer/src/styles.css`. Put classes in another module here and it
needs the same line, or the colours silently compile to nothing.
