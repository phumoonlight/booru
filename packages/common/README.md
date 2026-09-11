# common

The code the website and the desktop app both compile. Not a copy of either: there is one
definition of what a post is, one of how an image is squeezed, one search grammar, and
both front ends import them from here.

It exists because two programs read the same board and one of them writes to it. The
website renders the gallery; the desktop app (`packages/desktop`) creates, edits and
deletes posts from a machine with real CPU, because compression is work a free serverless
tier is bad at. Everything they must agree on — what a post is, how a query is parsed,
the write path, the encoders — is in this directory, and neither of them owns it.

The search is the clearest case. `data/search.ts` backs the website's listing *and* the
desktop's browse screen, so `1girl -solo rating:r18` narrows to the same rows in
both windows. Two implementations of that grammar is how `-tag` quietly comes to mean two
things.

Before this package the desktop app reached into the Next app's `src/` through an `@web`
alias, plus an `@/` alias only because the files over there spell each other that way.
That worked, but it made the website's internal layout part of the desktop build, and
left "is this file shared?" a question you answered by grepping. Now it is answered by
where the file is.

## What's in here

| | |
|---|---|
| `board.ts` | the two boards — post table, link table, count column, object prefixes and website path, spelled nowhere else |
| `search.ts` | the `?query=` grammar — `splitQuery`, `searchHref`, the rating metatags, `RESTRICTED_RATINGS` |
| `tags.ts` | tag parsing and the charset, `categoryColor`, `markColor` |
| `storage.ts` | the md5-derived image paths, per board, and the `ObjectStore` the upload writes through |
| `db.ts` | `Db`, the handle every function here takes, and `DbPool` for the two that open a transaction |
| `data/posts.ts` | the `Post` row shape, `postColumns`, and the single-post reads |
| `data/search.ts` | `searchPosts` — the whole query, tag resolution and cursor |
| `data/shared.ts` | the post write path, `resolveTagIds`, tag-name search, `listTags` |
| `data/tags.ts` | managing the vocabulary: create, rename, recategorize, delete, apply-by-tag |
| `data/rules.ts` | the tag rules — implications and recommendations, ids on the table and names above it |
| `data/form-sections.ts` | the rows the desktop tag form draws, their order, and their dependencies |
| `data/counters.ts` | `syncTagPostCounts` — recompute, never increment |
| `imgcmp/for-post.ts` | lossy AVIF (q50) for the stored image, bounded to `POST_MAX_DIMENSION` |
| `imgcmp/for-thumbnail.ts` | lossy AVIF thumbnail, 384px tall |
| `upload/pipeline.ts` | `createPostFromImage` — one image in, one post out |

## The rules that keep it shareable

- **Nothing here builds a client.** The caller passes a `Db` — and, for the upload, an
  `ObjectStore`. The web's own module is `server-only` and reads the environment, so a
  module that built its own could only ever run inside Next. This is the one constraint
  the whole package rests on: don't "simplify" either parameter away.
  It was `(supabase, admin)` until the board lost its accounts, then one Supabase client
  that was both a schema and a bucket. Two handles now, because a Postgres role and an S3
  key are two different credentials with two different powers.
- **No `next/*`, no `server-only`, no React.** Electron's main process compiles these
  files and has none of it.
- **No environment reads and no limits.** Ceilings are a property of where the code runs.
  The desktop's are in `packages/desktop/src/main/limits.ts`, and `createPostFromImage`
  takes them as an argument. (The web had its own, for Vercel; they went with its upload
  page.)
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
files**. `categoryColor` in `tags.ts` and `RATING_COLOR` in `search.ts` hold classes, and
the desktop renderer scans only its own tree, so both files are named in `@source` lines
in `packages/desktop/src/renderer/src/styles.css`. Put classes in another module here and
it needs the same line, or the colours silently compile to nothing.

The other, which is a JavaScript one: an SQL comment inside a tagged template is still
inside a JavaScript string, so a backtick in one ends the query and the parse errors
somewhere else entirely. The queries in `data/` keep their commentary above the template
rather than inside it.
