# Database Schema

**Source of truth:** `db/migrations/`, applied with `npm run db:push` by
`scripts/migrate.mjs`. There is no `db:reset` any more — dropping the schema is the whole
board, and it is typed out in a console now rather than kept behind one word. This document describes them; when
the two disagree, the migrations win and this file is the bug.

**Shape:**

```
collections ───< collection_posts        (the site: no tags, no link table)

tags ───< tag_rules >─── tags            (the vocabulary, kept for later — no post reads it)
tags >─── tag_form_sections ───< tag_form_section_deps >─── tags

artists ───< artist_urls                 (the desktop app's alone — no web grant)
artists ───< artist_images

site_settings                            (what the website is doing)
```

`tags.form_section_id` points at a section (`on delete set null`); a section's dependencies
point back at tags.

**Collections are the site.** There were two boards — `posts` and `generative_posts`, each
with a link table into `tags` and a count column on it — and every image on both was moved
onto a shelf before `0012_collections_only.sql` dropped them. What the AI board was is now a
fact about a shelf (`collections.is_ai`), and what an image's rating was is its shelf's
(`collections.rating`).

**The tag vocabulary outlived its posts.** `tags`, `tag_rules`, `tag_form_sections` and
`tag_form_section_deps` stay, and the desktop app's Tags screen still manages them — kept for
a later use rather than thrown away with the only thing that read them. Nothing joins them to
an image today.

Ten tables, no functions, no triggers. Six describe what is on the board (two of shelves,
four of vocabulary); three are the desktop app's artist list, which the website holds no
grant on; the last, `site_settings`, is a name and a string per setting and describes what
the *website* is doing — today the maintenance switch and its notice, written by the desktop
app and read on every visit that isn't answered from the site's ten-minute hold. Adding a
setting to it is an insert, not a migration. There is no `profiles` table: the board has no
accounts. Every write is made by the desktop app (`packages/desktop`) as `booru_app`, from a
connection string compiled into its own bundle; the website connects as `booru_web` and only
reads — and it reads `collections`, `collection_posts` and `site_settings`. It still holds
`select` on the four vocabulary tables and uses none of it.

`db/migrations/0001_baseline.sql` is the schema as it stood at the move to Neon, in
foreign-key order — `posts` → `tag_form_sections` → `tags` → `tag_form_section_deps` →
`post_tags` → `tag_rules`. It squashed the sixteen Supabase migrations, which was affordable
because the board was emptied in the same move. Everything since is a new numbered file:

| file | |
| --- | --- |
| `0002_site_settings.sql` | adds `site_settings` |
| `0003_sections_off_categories.sql` | takes `category` off `tag_form_sections`, so a form row is not a division of a category |
| `0004_section_sides.sql` | gives a section a `side`, so which column of the form a row is in is a fact about the row |
| `0005_generative_posts.sql` | added the second board — `generative_posts`, `generative_post_tags`, `tags.generative_post_count`. All dropped by 0012 |
| `0006_collections.sql` | adds `collections` and `collection_posts` |
| `0007_artists.sql` | adds `artists`, `artist_urls` and `artist_images` |
| `0008_artist_ai.sql`, `0009_artist_archive.sql`, `0010_artist_favorites.sql` | `artists.is_ai`, `archived_at`, `is_favorite` |
| `0011_collection_rating_mark.sql` | `collections.rating` and `collections.mark` |
| `0012_collections_only.sql` | drops both boards, both link tables and both count columns; adds `collections.is_ai`; drops `collection_posts.rating` |

---

## `collections`, `collection_posts`

`db/migrations/0006_collections.sql`, then `0011_collection_rating_mark.sql` and
`0012_collections_only.sql`

Named sets of images with no tags and no search, each image on exactly one shelf. They began
beside the boards, for the one-off nobody would file under a tag, and became the whole site
when the boards' images were moved onto them.

### `collections`

| column | type | notes |
| --- | --- | --- |
| `id` | `integer identity` | primary key |
| `name` | `text not null` | prose, not a tag: spaces, capitals and punctuation. `readCollectionName` (`@common/collections`) settles the spelling — trimmed, whitespace collapsed, 64 characters |
| `mark` | `text` | `0011`. Free prefix text drawn before the name — an emoji, `[WIP]`. `readCollectionMark`, 12 graphemes; null for none |
| `rating` | `text not null default 'g'` | `0011`. `g` \| `r` — General and R-18, and **the rating of every image on the shelf**, which has none of its own since `0012`. Restricted, the shelf is behind the NSFW setting |
| `is_ai` | `boolean not null default false` | `0012`. A shelf of generated images — what the AI board was, as a fact about a shelf. The website's shelf search filters on it; nothing else reads it |
| `created_at` | `timestamptz not null default now()` | |
| `updated_at` | `timestamptz not null default now()` | what the list is ordered by |

`collections_name_key` is `unique (lower(name))` — `Sketches` and `sketches` are one shelf
spelled two ways, and refusing the second is the useful answer. `collections_updated_idx` is
`(updated_at desc, id desc)`, the list's own order.

**`updated_at` is maintained in TypeScript** (`@common/data/collections-write.ts`): every
image added, removed or moved calls `touchCollection` inside the same transaction as the
change, and `updateCollection` sets it in the same statement as the name, mark, rating and
AI flag. Not by a trigger, for the reason nothing else here is: a plpgsql body needs a
migration to edit and reports an opaque error from inside a statement that was about
something else. Correcting one image's source does **not** touch it: the ordering answers
"what has happened to this shelf", and a source is a fact about one image.

**`is_ai` is a column, not a table.** `generative_posts` was a table because tag counts and
listings had to be impossible to mix by default. A shelf has neither, and the shelf list is
the one read that splits on it.

### `collection_posts`

| column | type | notes |
| --- | --- | --- |
| `id` | `integer identity` | primary key |
| `collection_id` | `integer not null references collections (id)` | **no `on delete cascade`** — see below |
| `file_name` | `text unique not null` | the md5 of the uploaded bytes, naming both stored objects. Unique across the whole table, not per shelf |
| `file_ext` | `text not null` | `check in ('jpg','png','gif','webp','avif')` |
| `file_size`, `width`, `height` | `integer not null` | of the **stored** image — an image that compressed or got bounded to 2048 records the smaller numbers |
| `source_url` | `text` | nullable |
| `view_count` | `integer not null default 0` | see [View counting](#view-counting) |
| `created_at` | `timestamptz not null default now()` | |

`collection_posts_collection_idx` is `(collection_id, id desc)` — a shelf's feed, "this
shelf, newest first", cursored by id. `/posts`, the newest images across every shelf, walks
the primary key backwards.

**Invariants**

- **A collection cannot be deleted while it holds anything.** The missing `on delete
  cascade` is the enforcement; `deleteCollection` counts first only so the refusal can say
  how many are in the way. A collection is the only container this schema has, and deleting
  one by accident would take a set of images that exist nowhere else.
- **An image lives on exactly one shelf**, which `file_name unique` says as well as the
  feature does: two rows for the same bytes would be two rows pointing at one pair of
  stored objects, since the prefix is shared, and deleting either would break the other.
- **An image's rating is its shelf's.** Every image read in `@common/data/collections.ts`
  narrows on the shelf's `rating` (`shelfVisible`), in the query rather than the page,
  because both feeds are actions anybody can call with any cursor. `0012` dropped the
  per-image column as it stood, raising no shelf first.
- **Storage paths are derived, never stored**: `collections/posts/{file_name}.{file_ext}`
  and `collections/thumbs/{file_name}.avif` (`@common/storage`). Flat rather than per shelf,
  so moving an image (`moveCollectionPost`) is one column of one row and no object moves.
- The cover on a shelf card is **derived** — the newest image on it — not a column. A
  `cover_post_id` would be a circular foreign key, a null to handle on every delete, and a
  picker nobody asked for, to answer a question the newest image already answers.
- **`rating` is stored as one letter and written as a word.** `?rating=r18` on the shelf
  search and `rating:r18` in a tag rule; `RATING_NAME` in `@common/search` is the only
  translation, `asRating` reads either form. Free-form, no check constraint, which is why
  collapsing the scale from four tiers needed no migration.

---

## `tags`

`db/migrations/0001_baseline.sql`; `0012_collections_only.sql` dropped both count columns


| column | type | notes |
| --- | --- | --- |
| `id` | `integer` PK identity | what `tag_rules` and `tag_form_section_deps` point at, so a rename carries both |
| `name` | `text unique not null` | `check (name ~ '^[a-z0-9_().-]+$')` — lowercase `snake_case` |
| `category` | `text not null default 'general'` | free-form; `TAG_CATEGORIES` in `@common/tags` is the list the app writes, each with a colour and a place in the order |
| `mark` | `text` (nullable) | what is drawn in front of the name — a colour or up to three glyphs — usually null; every read selects it |
| `form_section_id` | `smallint` (nullable) `→ tag_form_sections.id on delete set null` | which row of the **desktop tag form** the tag is offered on; null is no row, which is not offered at all |
| `implied_rating` | `text` (nullable) | a rating **floor** carried by this tag, stored as the letter — see [`tag_rules`](#tag_rules) |
| `created_at` | `timestamptz not null default now()` | |

**Indexes:** PK on `id`; `unique` on `name` (this is what serves every `=` and `any(…)`
lookup); `tags_name_prefix_idx (name text_pattern_ops)`, which served the autocomplete that
went with the upload form and has no reader now.
`tags_post_count_idx` went with its column. Every list is A–Z now — it was most-used first,
off a count that went with the posts it counted.

**Invariants**

- The prefix index only works for `like`, never `ilike`. A prefix search written again
  must use `like`; the name check constraint guarantees lowercase, so the results are
  identical, and `ilike` would silently be a sequential scan.
- `category` outside `TAG_CATEGORIES` is drawn in the plain foreground, labelled as
  stored (`categoryColor` / `categoryLabel`) and sorted after the known ones in every
  grouped list (`categoryOrder`) — reads never assume the list. Writes do:
  `z.enum(TAG_CATEGORIES)` guards the IPC channels that set this column, so one can
  only arrive by hand-editing the table.
- **`category` says what a tag is; `form_section_id` is where the desktop form offers it.**
  Two columns answering two questions. They were nested for one revision, and the nesting
  is gone: a row is free to hold `bikini` (General) beside `bare shoulders` (Appearance).
- **`form_section_id`, not a name.** The sections are
  [`tag_form_sections`](#tag_form_sections) and this points at one by id, so renaming a row
  carries every tag on it. `listTags` selects the id alone; the screens hold the whole list
  of rows in a store and match on it.
- **A section travels with its tag through a recategorization.** `setTagCategory` leaves
  the column alone: a section is not a division of a category.
- **A new tag is on no row.** Naming a tag and deciding where the form offers it are two
  decisions, and the second is made for a set of tags at once on the 🧱 Sections screen.
- **Deleting a tag is one statement.** `tag_rules` and `tag_form_section_deps` both cascade
  from it; `deleteTag` used to clear two link tables first, and both are gone.
- `mark` is cosmetic and every tag read selects it, because a read that left the column out
  would render a tag that has one as a tag that has none. It replaced a `TAG_EMOJI` record in
  code keyed by tag name.
- **One column, two kinds of value, and only one per tag.** `markColor` in `@common/tags`
  decides which by looking at it: a `#hex` or a CSS colour name is drawn as a dot, anything
  else as text. The one collision goes to the colour on purpose. `readTagMark` in
  `@common/data/tags` is what may be written: a colour, lowercased, or at most three
  graphemes none of which is plain ASCII; `''` clears the column back to null.
- It absorbed a **guess**: the desktop app used to paint a colour dot on any tag whose name
  began with a colour word from a list in code (`COLOR_NAMES`), which read
  `golden_retriever` as gold. A dot is asked for now.

## `tag_rules`

`db/migrations/0001_baseline.sql`


The two answers to "this tag is on an image, what else should be?". An **implication** is
applied by itself (`white_bra` means `bra` too); a **recommendation** is only offered, as a
chip to press. `@common/data/rules.ts` reads and writes both; the desktop Tags screen is the
only thing that edits them, and with no post write left nothing applies them today.

There was a third, `kind = 2`, the **form group**, which hid tags *inside* a form row. It is
[`tag_form_section_deps`](#tag_form_sections) now, said about the whole row.

| column | type | notes |
| --- | --- | --- |
| `tag_id` | `integer not null → tags.id on delete cascade` | the tag that triggers the rule |
| `kind` | `smallint not null` | `check (kind in (0, 1))` — **0 implies, 1 recommends** |
| `target_tag_id` | `integer not null → tags.id on delete cascade` | the tag the rule names |
| | PK `(tag_id, kind, target_tag_id)` | |
| | `check (tag_id <> target_tag_id)` | a tag implying itself can never do anything |

**Indexes:** the PK and nothing else. It orders `tag_id, kind` first, which is how one
tag's panel reads its own rules, and the whole set is read at once into the desktop app's
rule store anyway. There is deliberately no index on `target_tag_id`: only the cascade
reads that way, on a table of a few hundred rows.

**No `created_at`.** Nothing asks when a rule was written, and the column would be one more
thing to keep true for no reader.

**Invariants**

- **`target`, not `implied`.** One column serves both kinds, and only one of them implies
  anything.
- **Rows are ids, the app is names.** Everything above `@common/data/rules.ts` — the rule
  store, the rule diagram, the picker — is written in tag names; the table stores ids so a
  rename carries its rules and a delete takes them. That file is the one place the two
  spellings meet, with two plain joins back to `tags` (the foreign keys needed names only
  while PostgREST's embeds had to tell them apart).
- **A rule can only name a tag that exists**, which the foreign keys enforce and
  `resolveTagIds` refuses before them, naming what is missing.
- **The rating floor is not a row.** `tags.implied_rating` holds it, one per tag, as the
  letter (`g`/`r`). `listTagRules` folds it back into the implied list as a `rating:` token;
  `storedRating` is the reader, because `asRating` parses *tokens* and would drop a bare
  letter silently. A floor raises and never lowers (`raisedRating`, in the desktop's
  `shared/implications.ts`).
- **`kind` is a number and the app is words.** `RULE_KIND` in `@common/data/rules.ts` is
  the only place `0` and `1` are written; the check constraint is the other half of that
  pair.
- **Cycles are not a constraint.** `a → b → a` is storable; `impliedTags` walks with a
  `seen` set, so such a pair is useless rather than fatal.

## `tag_form_sections`

`db/migrations/0001_baseline.sql`, then
`db/migrations/0003_sections_off_categories.sql` and `db/migrations/0004_section_sides.sql`


The rows the **desktop tag form** draws, and their order — `hair color`, `hair styles`,
`clothes`. The website has never heard of them.

| column | type | notes |
| --- | --- | --- |
| `id` | `smallint` PK identity | what `tags.form_section_id` points at, so a rename carries every tag on the row |
| `name` | `text not null` | the row's label, lowercased and space-collapsed by `normalizeFormSection` |
| `side` | `smallint not null default 0` | `check in (0, 1)` — which column of the two-column form it is drawn in |
| `position` | `smallint not null default 0` | where it sits **within that column**, low first, ties by name |
| `deps_mode` | `text not null default 'any'` | `check in ('any', 'all')` — whether the row needs one of its dependencies, or all |
| `created_at` | `timestamptz not null default now()` | |
| | `unique (name)` | two rows reading the same on the form is what a free-text label has to be defended against |

`tag_form_section_deps` holds what a row waits for: `(section_id, tag_id)`, both cascading.
A section with no rows there has no condition and is always drawn, which is most of them.
Tag **ids**, so a rename carries the dependency and a delete takes it — the same reasoning
as `tag_rules`, and only safe because no write path coins a tag.

**Indexes:** the primary key and the unique constraint. The whole table is read at once
into the window's store, the way the tag rules are.

**Invariants**

- **The id is the identity; the name is a label.** It was keyed by `(category, name)` for
  exactly one revision, and correcting a spelling made a different section while every tag
  on the old row fell quietly off the form.
- **`tags.form_section_id` is `on delete set null`.** Deleting a row puts its tags back on
  no row — a re-file rather than a loss.
- **A section is not inside a category** (`0003`). Dropping the column merged nothing; a
  name that collided across two categories took its old category in brackets.
- **The rows are written one edit at a time** — create, rename, delete, reorder
  (`FormSectionEdit`). A list of names cannot express a rename.
- **A condition belongs to the row, not to a tag.** `blue archive` waits for
  `blue_archive`; `hair color` waits for nothing. A row never waits for a tag that is on it:
  `editFormSections` and `setTagFormSection` both refuse that pair, since the row would
  never be drawn to offer the tag that opens it.
- **Order is `side`, then `position`, then `name`.** The tie-break makes a table written by
  hand come out alphabetical rather than in insertion order.
- **The side is stored, not derived.** It was the parity of a flat `position` for one
  revision, which holds only while the two columns are the same length. A reorder writes
  **both columns**, each in its own order, which says every row's side and place in one edit.

---

## `site_settings`

`db/migrations/0002_site_settings.sql`

| column | type | notes |
| --- | --- | --- |
| `key` | `text primary key` | the setting's name |
| `value` | `text not null default ''` | what it is set to; the meaning belongs to the reader |
| `updated_at` | `timestamptz not null default now()` | set by the write, not by a trigger |

| key | value | |
| --- | --- | --- |
| `maintenance` | `'on'` closes the site; anything else serves | read loosely (`on`, `true`, `yes`, `1`), written only as `on`/`off` |
| `maintenance_message` | the notice, optional | trimmed to 500 on write |

**A name and a string on purpose.** A column per setting means a migration for every
switch anyone ever wants, and a site-wide switch is exactly what gets wanted when there is
no time to write one. JSON would buy structure nothing here needs and cost the property the
table exists for: a row a person can read and change by hand in a console. A setting with
two parts is therefore two rows.

The meaning moves to `@common/data/site.ts`, where each setting is a reader plus a default:
a row that is missing, misspelled or hand-edited into nonsense costs the default and never
a throw — the only way a settings table may fail on a page that has to render. Only an
affirmative closes the site; the failure worth avoiding is a board that shuts itself over a
row it misread.

`readSiteState` and `setSiteState` are the accessors. The write is one upsert covering both
rows, so the switch and its notice can never land apart, and `updated_at` means "when
someone last decided this" — which is why re-wording a notice moves it, and why a read
takes the later of the two rows.

**Grants are the exception to the loop in `db/grants.sql`:** `booru_web` gets `select`,
`booru_app` gets `select, insert, update`. Insert because the next setting is a new key;
no delete, because a key the code has stopped reading is harmless where a key it still
reads is a site that has forgotten what it was doing.

---

## Roles

There is no RLS. There was, on every table, with a select policy and nothing else — the
only way to say "the anon key may read" when the key itself is public. There is no public
key any more, so the boundary is drawn where Postgres draws boundaries:

| role | held by | may |
| --- | --- | --- |
| `booru_owner` | the environment file, the migration runner only | everything, DDL included |
| `booru_app` | compiled into the desktop bundle | `select, insert, update, delete` on the six content tables and the three artist tables, `select, insert, update` on `site_settings`; **no** create, alter or drop |
| `booru_web` | Vercel | `select` on the six content tables and `site_settings`; `update (view_count)` on `collection_posts`; nothing on the artist tables, and nothing else |

The six content tables are `app_tables` in `db/grants.sql`: `tags`, `tag_rules`,
`tag_form_sections`, `tag_form_section_deps`, `collections`, `collection_posts`. The grants
are re-applied on every `db:push` and applied to whichever roles exist, so a scratch
database still migrates. `db/README.md` creates them.

The website's half is strictly stronger than what it replaced, where Vercel carried a
service-role key that bypassed every policy in the project in order to count views. The
desktop's is the same trust model it always had — possession of the installer is the
authorization — with one addition that matters: `booru_app` owns nothing, so a string
extracted from a bundle can vandalise the data and cannot drop a table.

Images are not in the database. They are one public R2 bucket — `collections/posts/` and
`collections/thumbs/` for the shelves, `artists/images/` and `artists/thumbs/` for the
artist list's examples — read by URL and written only by the desktop app's bucket key. The
boards' prefixes, `posts/`, `thumbs/`, `generative/posts/` and `generative/thumbs/`, are
still in the bucket as orphans: `0012` reached the database, and a migration cannot reach
the bucket.

---

## Operations

What remains is TypeScript taking its database handle as an argument rather than building
one — that is what lets Electron's main process run the same code the website compiles.
There is no search, no post write and no tag counter any more; they went with the boards.

### View counting

`src/lib/data/collections.ts` — `incrementCollectionPostView(postId)`, called only from the
`recordCollectionPostView` action. **The only write the website makes**, and one statement:
`update collection_posts set view_count = view_count + 1`, the table name coming out of
`COLLECTION_TABLES`. Skipped while the site is closed for maintenance.

- It was the `increment_post_view` RPC, then a PostgREST compare-and-swap that read the
  count and wrote back with an equality check, up to three attempts, then dropped the view.
  An increment is atomic; that was what standing in for one cost.
- `view_count` is not derived from anything — the rows that would define it are never
  stored — so the increment *is* the record.
- `booru_web` holds `update (view_count)` on `collection_posts` and no other write grant
  anywhere, so the column-level grant is what makes this safe rather than the function
  being careful. Never on a read path, so prefetches, `generateMetadata` and crawlers don't
  inflate it.

---

## Removed, and why

Everything here is history. It is recorded so a change is not proposed twice, and none of
it is in the schema.

| gone | was | why |
| --- | --- | --- |
| `profiles` table, `handle_new_user()` trigger | one row per `auth.users` account | The board dropped its accounts. Every account was one person's, nothing displayed who uploaded what, and the desktop bundle already carried the service-role key — the login guarded a door it was not the lock for |
| `posts.uploader_id` | `uuid → profiles.id` | Never displayed anywhere on the site; went with `profiles` |
| write RLS policies, then RLS itself | `(select auth.uid()) is not null` on every table | No session left to test — and once the public anon key was gone too, a `grant` says the whole of it |
| `rating_counts` table + 3 triggers | a counter row per rating tier | Bought a number beside four fixed filters. The facet lists the scale without counts |
| `search_posts`, `create_post_with_tags`, `update_post_with_tags`, `increment_post_view` | plpgsql functions | Hard to edit, opaque when they failed. Became TypeScript — and then went with the boards, except the view counter |
| `posts.status`, `is_admin()`, `profiles.role` | a moderation tier | Dropped before the schema was squashed |
| `posts`, `generative_posts` (`0012`) | the two boards: tagged, searched images, one table per board | Every image was moved onto a shelf first. With a shelf's rating and `is_ai` covering what the second table and the per-post rating were for, the tables held nothing anybody read |
| `post_tags`, `generative_post_tags` (`0012`) | the link tables into `tags`, with `post_tags_tag_post_idx` and its twin | Nothing left to link. The vocabulary they pointed at stays |
| `tags.post_count`, `tags.generative_post_count` (`0012`) | the denormalized per-board counts, recomputed by `syncTagPostCounts`, and `tags_post_count_idx` | Counted rows in the link tables, which are gone. Tags list A–Z |
| `collection_posts.rating` (`0012`) | a rating per shelved image, beside the shelf's (`0011`) | Two answers to one question, where the shelf's already hid the whole shelf. Dropped as it stood — no shelf was raised to match its images first |
| `posts_rating_idx`, the `posts/` and `generative/` object prefixes | the rating filter; the boards' storage | Went with their tables. The objects are orphans in the bucket |

The eighteen migrations written during the build were squashed into four; those four and
the twelve after them were squashed again into one baseline when the board moved to Neon
and was emptied. Schema changes from here are **always** a new numbered
file — never a dashboard edit, and never an edit to one once it has been pushed anywhere
real.

## Deliberately not built

comments, pools, notes, tag_aliases, post_votes, moderation queue / audit log, wiki
pages, favorites, public accounts.

Tag implications and recommendations *do* exist — as [`tag_rules`](#tag_rules), keyed by
tag id so a rename carries them and a delete takes them. Only the desktop app reads them. See
[packages/desktop/README.md](../packages/desktop/README.md).

---

## `artists`, `artist_urls`, `artist_images`

`db/migrations/0007_artists.sql`

The desktop app's reading list: an artist, the addresses they post at, a few example
images, and when they were last caught up on. **Separate from every other feature** — not a
tag, not a collection — and **not on the website**: `db/grants.sql` gives `booru_web` no
grant on any of the three, so the database refuses the read rather than a page remembering
not to make one.

| table | column | notes |
| --- | --- | --- |
| `artists` | `name text not null` | prose; `readArtistName` (`@common/artists`). `artists_name_key` is `unique (lower(name))` |
| `artists` | `is_ai boolean not null default false` | AI-generated work; the desktop screen shows one kind at a time, split in TypeScript |
| `artists` | `archived_at timestamptz` | null on the reading list; set, the artist is in the archive, ordered newest first. `markArtistRead` refuses an archived artist. Unarchiving leaves `read_at` alone |
| `artists` | `is_favorite boolean not null default false` | on the favourites tab rather than the reading list — read and ordered the same way. `archived_at` wins while set; unarchiving returns a favourite to the favourites |
| `artists` | `read_at timestamptz` | the whole of the list's order: `read_at asc nulls first, id asc` (`artists_read_idx`). Null is never read. No read/unread flag — how far behind you are is a date |
| `artist_urls` | `artist_id … on delete cascade` | |
| `artist_urls` | `url text unique not null` | normalized by `readArtistUrl`. Unique across **every** artist, so a pasted address already saved names who has it |
| `artist_images` | `artist_id … on delete cascade` | the stored objects are removed by `removeArtist` in TypeScript, which reads the names first |
| `artist_images` | `file_name text unique not null` | the md5, naming `artists/images/<md5>.<ext>` and `artists/thumbs/<md5>.avif`; unique across the table for the reason `collection_posts.file_name` is |
| `artist_images` | `file_ext`, `file_size`, `width`, `height` | of the stored image, as on a collection image |

**Mark as read is `read_at = now()`**, the database's clock, so two installs cannot order
one list two ways. Uploaded images only — an example is never a link to another site's
image, since the window cannot load one (CSP) and pixiv refuses the fetch without its own
`Referer`.
