# common

The code the website and the desktop app both compile. Not a copy of either: there is one
definition of what a collection image is, one of how an image is squeezed, one rating scale,
and both front ends import them from here.

It exists because two programs read the same board and one of them writes to it. The
website renders the shelves; the desktop app (`packages/desktop`) uploads onto them, edits
and deletes from a machine with real CPU, because compression is work a free serverless
tier is bad at. Everything they must agree on — the shelf reads, the rating scale, the
upload pipeline, the encoders — is in this directory, and neither of them owns it.

The shelf reads are the clearest case. `data/collections.ts` backs every page of the
website *and* the desktop's Collections screen, so a shelf's contents and its rating mean
the same thing in both windows. It was the tag search that made this argument while there were
boards to search; a second implementation of either is how two windows quietly come to
disagree.

Before this package the desktop app reached into the Next app's `src/` through an `@web`
alias, plus an `@/` alias only because the files over there spell each other that way.
That worked, but it made the website's internal layout part of the desktop build, and
left "is this file shared?" a question you answered by grepping. Now it is answered by
where the file is.

## What's in here

| | |
|---|---|
| `collections.ts` | the shelves: two table names, two object prefixes, the hrefs, the shelf list's filter params (`collectionsHref`, `readCollectionFilter`), and what counts as a name and a mark |
| `artists.ts` | the desktop app's artist list: three table names, two object prefixes, what counts as a name and an address |
| `search.ts` | what is left of the `?query=` grammar: the rating scale (`RATINGS`, `asRating`, `ratingToken`, `RESTRICTED_RATINGS`) and `tagLabel` |
| `tags.ts` | tag parsing and the charset, `TAG_CATEGORIES`, `categoryColor`, `markColor`, the form-section spacer spelling |
| `storage.ts` | the md5-derived image paths — the collections' pair and the artists' — and the `ObjectStore` the upload writes through |
| `db.ts` | `Db`, the handle every function here takes, and `DbPool` for the ones that open a transaction |
| `data/collections.ts` | the shelf list (name, rating and AI filters), one shelf's feed, the newest images across every shelf, the count, prev/next — every image read narrowed on its shelf's rating |
| `data/collections-write.ts` | creating, editing and deleting shelves; adding, editing, moving and removing images; `touchCollection` |
| `data/shared.ts` | `resolveTagIds`, `listTags` (A–Z) — how anything reaches the vocabulary |
| `data/tags.ts` | managing the vocabulary: create, rename, recategorize, file onto a form row, mark, delete |
| `data/rules.ts` | the tag rules — implications and recommendations, ids on the table and names above it |
| `data/form-sections.ts` | the rows the desktop tag form draws, their order, and their dependencies |
| `data/site.ts` | `site_settings` — the maintenance switch and its notice |
| `data/artists.ts`, `data/artists-write.ts` | the artist list, never-read first; no web caller and no web grant |
| `imgcmp/for-post.ts` | lossy AVIF for the stored image, quality on a ramp by size, bounded to `POST_MAX_DIMENSION` |
| `imgcmp/for-thumbnail.ts` | lossy AVIF thumbnail, 384px tall |
| `upload/image.ts` | `inspectImage`, `encodeImage`, `storeImage` — the half of an upload that is only about pixels |
| `upload/pipeline.ts` | `createCollectionPostFromImage` — one image in, one shelved row out |
| `upload/artist.ts` | `createArtistImageFromImage` — the same encode, onto an artist |

`board.ts`, `data/posts.ts`, `data/search.ts` and `data/counters.ts` went with the boards
(`db/migrations/0012_collections_only.sql`). The tag files stay because the vocabulary did,
with nothing joining it to an image.

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
  The desktop's are in `packages/desktop/src/main/limits.ts`, and `createCollectionPostFromImage`
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
