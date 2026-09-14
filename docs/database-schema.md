# Database Schema

**Source of truth:** `db/migrations/`, applied with `npm run db:push` by
`scripts/migrate.mjs`. There is no `db:reset` any more — dropping the schema is the whole
board, and it is typed out in a console now rather than kept behind one word. This document describes them; when
the two disagree, the migrations win and this file is the bug.

**Shape:**

```
posts            >─── post_tags            ───< tags ───< tag_rules >─── tags
generative_posts >─── generative_post_tags ───< tags

tags >─── tag_form_sections ───< tag_form_section_deps >─── tags

collections ───< collection_posts        (no tags, no link table)

artists ───< artist_urls                 (the desktop app's alone — no web grant)
artists ───< artist_images
```

`tags.form_section_id` points at a section (`on delete set null`); a section's dependencies
point back at tags.

**Two boards over one vocabulary.** `posts` and `generative_posts` are the same table
twice — column for column — and each has its own link table into the shared `tags`, and its
own count column on it. A `generated boolean` on `posts` would have been the smaller
migration and could not have kept the two apart by default: every listing, walk, sitemap
and counter would have had to remember the flag. See `generative_posts` below.

**Collections are the other shape.** `collections` and `collection_posts` touch `tags` not
at all: an image on a shelf carries none, is never searched, belongs to exactly one shelf
and is in neither gallery. That is why they are not a third board — see `collections` below.

Fourteen tables, no functions, no triggers. Ten describe what is on the board; three are the
desktop app's artist list, which the website holds no grant on; the last,
`site_settings`, is a name and a string per setting and describes what the *website* is
doing — today the maintenance switch and its notice, written by the desktop app and read on
every visit that isn't answered from the site's ten-minute hold. Adding a setting to it is
an insert, not a migration. There is no `profiles` table: the board has no
accounts. Every write is made by the desktop app (`packages/desktop`) as `booru_app`,
from a connection string compiled into its own bundle; the website connects as
`booru_web` and only reads — and it reads three of the six: `tag_rules`,
`tag_form_sections` and `tag_form_section_deps` are the desktop tag form's, consulted only
where a post is tagged.

`db/migrations/0002_site_settings.sql` adds `site_settings`.
`db/migrations/0003_sections_off_categories.sql` takes `category` off `tag_form_sections`,
so a form row is not a division of a category, and
`db/migrations/0004_section_sides.sql` gives it a `side`, so which column of the form a row
is in is a fact about the row rather than the parity of its position.
`db/migrations/0005_generative_posts.sql` adds the second board — `generative_posts`,
`generative_post_tags` and `tags.generative_post_count`.
`db/migrations/0006_collections.sql` adds `collections` and `collection_posts`.
`db/migrations/0007_artists.sql` adds `artists`, `artist_urls` and `artist_images`, and
`db/migrations/0008_artist_ai.sql` adds `artists.is_ai`.

`db/migrations/0001_baseline.sql` is the whole schema in foreign-key order — `posts` →
`tag_form_sections` → `tags` → `tag_form_section_deps` → `post_tags` → `tag_rules` — ending
with the role grants. It squashed the sixteen Supabase migrations, which is affordable
because the board was emptied in the same move; what it drops is the create-then-drop of
`form_sections` and of `tags.category2`, which described how the schema arrived rather
than where it is. Everything from here is a new numbered file.

---

## `posts`

`db/migrations/0001_baseline.sql`


| column | type | notes |
| --- | --- | --- |
| `id` | `integer` PK, generated always as identity | booru-style numeric ids; also the sort key and the feed's cursor. `integer`, not `bigint`, because postgres.js hands a `bigint` back as a *string* — see the baseline's note |
| `file_name` | `text unique not null` | the name both stored files take. Value is the md5 of the uploaded bytes, which is what also makes it the dedup key |
| `file_ext` | `text not null` | `check in ('jpg','png','gif','webp','avif')` |
| `file_size` | `int not null` | bytes **as stored**, not as uploaded |
| `width` / `height` | `int not null` | of the stored image, read by sharp |
| `rating` | `text not null default 'g'` | `g` \| `r` — General and R-18. Free-form, no check constraint, which is why collapsing the scale from four tiers needed no migration |
| `source_url` | `text` | nullable |
| `view_count` | `int not null default 0` | see [View counting](#view-counting) |
| `created_at` | `timestamptz not null default now()` | |

**Indexes:** PK on `id`; `unique` on `file_name`; `posts_rating_idx (rating)` for the
rating filter. Nothing else — `order by id desc` and the feed's `id < cursor` are both
served by the primary key, which Postgres reads backwards as cheaply as forwards.

**Invariants**

- Storage paths are derived, never stored: `posts/{file_name}.{file_ext}` and
  `thumbs/{file_name}.avif`, both in the one bucket (`@common/storage`).
- `rating` is stored as one letter and written as a word. A query says
  `rating:r18`; `RATING_NAME` in `@common/search` is the only translation, `asRating`
  reads either form, `ratingToken` writes only the word. Free-form on purpose: a new tier
  is a code change, not a migration.
- `file_size`, `width` and `height` describe the file that was stored. An image that
  compressed or got bounded to 2048 records the smaller numbers, not the uploaded ones.

## `tags`

`db/migrations/0001_baseline.sql`
`db/migrations/0001_baseline.sql`
`db/migrations/0001_baseline.sql`
`db/migrations/0001_baseline.sql`
`db/migrations/0001_baseline.sql`
`db/migrations/0001_baseline.sql`


| column | type | notes |
| --- | --- | --- |
| `id` | `integer` PK identity | `/tags/[id]` is addressed by this, so a rename never breaks a link |
| `name` | `text unique not null` | `check (name ~ '^[a-z0-9_().-]+$')` — lowercase `snake_case` |
| `category` | `text not null default 'general'` | free-form; `TAG_CATEGORIES` in `@common/tags` is the eight the app writes, each with a colour and a place in the order |

| `mark` | `text` (nullable) | what is drawn in front of the name — a colour or up to three glyphs — usually null; every read selects it |
| `form_section_id` | `smallint` (nullable) `→ tag_form_sections.id on delete set null` | which row of the **desktop tag form** the tag is offered on; null is no row, which is not offered at all. The website never reads it |
| `implied_rating` | `text` (nullable) | a rating **floor** carried by this tag, stored as the letter like `posts.rating` — see [`tag_rules`](#tag_rules) |
| `post_count` | `int not null default 0` | denormalized count of `post_tags`, see [Counters](#counters) |
| `generative_post_count` | `int not null default 0` | the same number for the other board, from `generative_post_tags` (`db/migrations/0005_generative_posts.sql`) |
| `created_at` | `timestamptz not null default now()` | |

**Indexes:** PK on `id`; `unique` on `name` (this is what serves every `=` and `in (…)`
lookup); `tags_name_prefix_idx (name text_pattern_ops)` for autocomplete;
`tags_post_count_idx (post_count desc)` for the popularity ordering.

**Invariants**

- The prefix index only works for `like`, never `ilike`. Autocomplete in
  `@common/data/shared.ts` therefore uses `like`; the name check constraint guarantees
  lowercase, so the results are identical either way. Changing it back to `ilike` silently
  turns every autocomplete into a sequential scan.
- `category` outside `TAG_CATEGORIES` is drawn in the plain foreground, labelled as
  stored (`categoryColor` / `categoryLabel`) and sorted after the known ones in every
  grouped list (`categoryOrder`) — reads never assume the list. Writes do:
  `z.enum(TAG_CATEGORIES)` guards the two IPC channels that set this column, so one can
  only arrive by hand-editing the table.
- **`category` is what the website shows; `form_section_id` is where the desktop form
  offers the tag.** Two columns answering two questions: a category says what a tag *is*,
  a row is a place to put your hand. They were nested for one revision — the form drew a
  category heading with its sections indented under it — and the nesting is gone: a row is
  free to hold `bikini` (General) beside `bare shoulders` (Appearance), which is what the
  person tagging a swimsuit is actually reaching for. The chip keeps its category's colour
  wherever it is drawn.
- **`form_section_id`, not a name.** The sections are
  [`tag_form_sections`](#tag_form_sections) and this points at one by id, so renaming a row
  carries every tag on it. `listTags` embeds the name beside the id, which is the one place
  the two meet. Null is no row, which means the tag is **not offered in the form at all**.
  `listTags` selects the id alone — the row's name came back beside it while the screens
  grouped tags by that spelling, and they hold the whole list of rows in a store now.
- **A section travels with its tag through a recategorization.** `setTagCategory` leaves
  the column alone: a section is not a division of a category, so there is nothing for the
  value to be outside of, and a `dress` moved to another category belongs on the `clothes`
  row wherever it lands. It did clear the column for as long as the two were nested, which
  is why the desktop's edit panel used to drop its section menu on every category change.
- **A new tag is on no row.** `createTag` still takes a section id, and the desktop's New
  tag form passes null: naming a tag and deciding where the form offers it are two
  decisions, and the second is made for a set of tags at once on the 🧱 Form sections
  screen, where each row is a card holding what is already on it.
- There was a `category2`, and this is not it restored — it is the same idea aimed at a
  different thing. That one was a heading *inside* one picker, dropped because a heading
  cannot shorten a category. What narrows a picker now is the form groups on
  [`tag_rules`](#tag_rules), which hide per post; `form_section` only decides which row a
  tag is drawn on.
- `mark` is cosmetic and the opposite of local: every tag read selects it, because a tag
  is drawn with its mark wherever it is drawn at all and a read that left the column out
  would render a tag that has one as a tag that has none. It replaced a `TAG_EMOJI` record
  in code keyed by tag name, which made a new tag's glyph a build and an installer away
  from being seen.
- **One column, two kinds of value, and only one per tag.** `markColor` in `@common/tags`
  decides which by looking at it: a `#hex` or a CSS colour name comes back as itself and
  is drawn as a dot, anything else comes back null and is drawn as text. The one collision
  goes to the colour on purpose — a mark of `red` is a red dot, since somebody who wanted
  the word would have typed something that is not also a colour. `readTagMark` in
  `@common/data/tags` is what may be written: a colour, lowercased, or at most three
  graphemes none of which is plain ASCII; `''` clears the column back to null.
- It absorbed a **guess** that used to live beside it. The desktop app painted a colour dot
  on any tag whose name began with a colour word, from a list in code (`COLOR_NAMES`),
  longest match first. That read `golden_retriever` as gold, had nothing to say about a
  colour the list had not heard of, and could not be corrected on the one tag it got wrong.
  Both the list and the guess are gone; a dot is asked for now.

## `tag_rules`

`db/migrations/0001_baseline.sql`
`db/migrations/0001_baseline.sql`


The two answers to "this tag is on the post, what else should be?". An **implication** is
applied by itself (`white_bra` means the post is also a `bra`); a **recommendation** is
only offered, as a chip to press. `@common/data/rules.ts` reads and writes both; the
desktop app is the only thing that consults them.

There was a third, `kind = 2`, the **form group**: the tags the form should offer once this
tag is on the post, and hide otherwise. It was the right question in the wrong place — it
hid tags *inside* a row, so the row was still drawn with a ＋ that opened onto nothing — and
it is [`tag_form_section_deps`](#tag_form_sections) now, said about the whole row.

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

**No `created_at`**, alone among the tables. Nothing asks when a rule was written — the
whole set is read at once and drawn in tag order — and the column would be one more thing
to keep true for no reader.

**Invariants**

- **Both foreign keys are named**, `tag_rules_tag_id_fkey` and
  `tag_rules_target_tag_id_fkey`, because both point at `tags` and PostgREST needs the
  constraint name to tell the two embeds apart. `listTagRules` asks for
  `tags!tag_rules_tag_id_fkey(name)` by that exact spelling.
- **`target`, not `implied`.** One column serves both kinds, and only one of them implies
  anything: on a `kind = 1` row it is a tag that gets offered, not one that gets added.
- **Rows are ids, the app is names.** Everything above `@common/data/rules.ts` — the rule
  store the tag field consults on every keystroke, the rule diagram, the picker — is
  written in tag names; the table stores ids so a rename carries its rules and a delete
  takes them. That file is the one place the two spellings meet.
- **A rule can only name a tag that exists**, which the foreign keys now enforce and
  `resolveTagIds` refuses before them. This is the same rule the post write paths follow.
- **The floor is stored as a letter, listed as a token.** The column holds `g`/`s`/`q`/`e`
  the way `posts.rating` does; the rule list above it carries `rating:r18`, because
  that is the grammar every helper there expects. `storedRating` in `@common/data/rules.ts`
  is the reader — `asRating` parses *tokens* and returns null for a bare `e`, so reading
  the column through it drops every floor silently.
- **The rating floor is not a row.** `tags.implied_rating` holds it: one per tag, since a
  floor under a floor is the same rule written twice. `listTagRules` folds it back into the
  implied list as a `rating:` token, which is the grammar `?query=` uses and the shape
  every helper above expects. It **raises** a post and never lowers one (`raisedRating`).
- **`kind` is a number and the app is words.** `RULE_KIND` in `@common/data/rules.ts` is
  the only place `0` and `1` are written; the check constraint is the other half of that
  pair. Everything above that file — the IPC channels, the panel, the diagram — says
  `'implies'` or `'recommends'`, so a row read straight out of the table is the one place
  the meaning has to be looked up.
- **Cycles are not a constraint.** `a → b → a` is storable; `impliedTags` walks with a
  `seen` set, so such a pair is useless rather than fatal.

## `tag_form_sections`

`db/migrations/0001_baseline.sql`, then
`db/migrations/0003_sections_off_categories.sql` and `db/migrations/0004_section_sides.sql`


The rows the **desktop tag form** draws, and their order — `hair color`, `hair styles`,
`clothes`. The website has never heard of them: it draws the category, one heading.

| column | type | notes |
| --- | --- | --- |
| `id` | `smallint` PK identity | what `tags.form_section_id` points at, so a rename carries every tag on the row |
| `name` | `text not null` | the row's label, lowercased and space-collapsed by `normalizeFormSection` |
| `side` | `smallint not null default 0` | `check in (0, 1)` — which column of the two-column form it is drawn in |
| `position` | `smallint not null default 0` | where it sits **within that column**, low first, ties by name |
| `deps_mode` | `text not null default 'any'` | `check in ('any', 'all')` — whether the row needs one of its dependencies on the post, or all |
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
  exactly one revision, and renaming exposed why that was wrong: the name *was* the
  section, so correcting a spelling made a different one and every tag on the old row fell
  quietly off the form. The same lesson `tag_rules` learned moving off `save.json`.
- **`tags.form_section_id` is `on delete set null`.** Deleting a row takes it out of the
  form and puts its tags back on no row at all — a re-file rather than a loss, and the same
  answer the free-text column gave, said structurally instead of by the read being
  forgiving.
- **A section is not inside a category** (`0003_sections_off_categories.sql`). It had a
  `category` column for one revision, and the nesting was the same question asked twice —
  the upper half being about the vocabulary rather than about tagging — while forbidding
  the one thing a form row is for: holding tags of several categories that go on the post
  together. Dropping the column merged nothing; a name that collided across two categories
  took its old category in brackets, to be corrected by hand on the Sections panel.
- **The rows are written one edit at a time**, not as a list: create, rename, delete and
  reorder (`FormSectionEdit`). A list of names cannot express a rename, which is the whole
  reason the list-shaped write went.
- **A condition belongs to the row, not to a tag.** `blue archive` waits for
  `blue_archive`; `hair color` waits for nothing. This is where form groups went: they said
  the same thing on the tag that triggered them and hid tags *inside* a row, leaving the row
  drawn with a ＋ that opened onto an empty picker. Implied tags satisfy a dependency, and a
  row the post already has a tag on is drawn whatever its condition says.
- **An empty section is the point.** It is drawn in the form with its ＋ and nothing on it,
  which is how the first tag gets filed into a new row — the one thing free text on each tag
  could not do. The other half is the order.
- **Order is `side`, then `position`, then `name`.** The tie-break makes a table written by
  hand, every position left at its default, come out alphabetical rather than in insertion
  order.
- **The side is stored, not derived.** It was the parity of a flat `position` for one
  revision — even left, odd right — which holds only while the two columns are the same
  length, and a single ordered list has no way to say that one is longer. The surplus row
  came out on the wrong side of the divider, and the empty space at the foot of the shorter
  column was a place the model could not name, so a row could not be dragged there. Two
  authored facts instead: which column, and where in it. A reorder therefore writes **both
  columns**, each in its own order, which says every row's side and place in one edit.

## `post_tags`

`db/migrations/0001_baseline.sql`


| column | type | notes |
| --- | --- | --- |
| `post_id` | `integer not null → posts.id on delete cascade` | |
| `tag_id` | `integer not null → tags.id` | **no cascade** |
| | PK `(post_id, tag_id)` | |

**Indexes:** PK covers post→tags; `post_tags_tag_post_idx (tag_id, post_id)` covers
tag→posts and makes the recount an index-only scan.

**Invariants**

- Deleting a tag must delete **every board's** links first, or the foreign key refuses —
  one row in `generative_post_tags` is enough to refuse the whole statement (`deleteTag`
  in `@common/data/tags.ts`, one `with` per board in one statement).
- Deleting a post must read its links *before* the delete, or the cascade eats the list
  of tags that need recounting (`deletePostRow` in `@common/data/shared.ts`).

---

## `generative_posts`, `generative_post_tags`

`db/migrations/0005_generative_posts.sql`

The second board: images that were generated rather than drawn. `generative_posts` has
**exactly the columns `posts` has** and `generative_post_tags` exactly the columns
`post_tags` has, including the indexes — `generative_posts_rating_idx` and
`generative_post_tags_tag_post_idx`. Nothing here is new; what is new is that it is a
separate set of rows.

**Why a table and not a column.** A generated image is a post in every way the site cares
about, so `posts.generated boolean` was the obvious move and the wrong one: it makes mixing
the two boards the *default*, and correct behaviour a thing every listing, neighbour walk,
sitemap entry and counter has to remember. A separate table makes the mistake impossible to
make silently, which is the same bargain the role grants take against RLS.

**The vocabulary is shared; the counts are not.** Both boards point at `tags`, so a tag
means one thing across the site and a rename carries everywhere. `tags.post_count` could not
be shared: a tag on four hundred generated images and two drawings is not a tag with four
hundred and two posts on either gallery. So `tags.generative_post_count` is the second
count, recomputed by the same `syncTagPostCounts` with the board named.

**Which names a query uses is `@common/board`**, one lookup of six strings per board — post
table, link table, count column, two object prefixes and the website path. Every read and
write in `@common/data/*` takes a `Board` and interpolates those with `db(...)`, as
identifiers; the default is `'post'` everywhere, so nothing written before the second board
existed changed meaning.

`file_name` is unique **per board**, so the same image can be a post on both: two rows, two
pairs of stored objects, under `generative/posts/` and `generative/thumbs/` rather than
`posts/` and `thumbs/`.

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

## `collections`, `collection_posts`

`db/migrations/0006_collections.sql`

Named sets of images that are **not posts**: no tags, no search, each image on exactly one
shelf, and none of them in either gallery. They exist because the board is a tag vocabulary
and a one-off — the niche piece nobody would file under a tag — dilutes every tag it is
given. A shelf is a better answer than a bad tag.

### `collections`

| column | type | notes |
| --- | --- | --- |
| `id` | `integer identity` | primary key |
| `name` | `text not null` | prose, not a tag: spaces, capitals and punctuation. `readCollectionName` (`@common/collections`) settles the spelling — trimmed, whitespace collapsed, 64 characters |
| `created_at` | `timestamptz not null default now()` | |
| `updated_at` | `timestamptz not null default now()` | what the list is ordered by |

`collections_name_key` is `unique (lower(name))` — `Sketches` and `sketches` are one shelf
spelled two ways, and refusing the second is the useful answer. `collections_updated_idx` is
`(updated_at desc, id desc)`, the list's own order.

**`updated_at` is maintained in TypeScript**, by `touchCollection`
(`@common/data/collections.ts`), and touched by a rename and by every image added or
removed — inside the same transaction as the change. Not by a trigger, for the reason
nothing else here is: a plpgsql body needs a migration to edit and reports an opaque error
from inside a statement that was about something else. Correcting one image's rating does
**not** touch it: the ordering answers "what has happened to this shelf", and a rating is a
fact about one image.

### `collection_posts`

`posts`' columns minus everything about tags, plus the shelf it is on.

| column | type | notes |
| --- | --- | --- |
| `id` | `integer identity` | primary key |
| `collection_id` | `integer not null references collections (id)` | **no `on delete cascade`** — see below |
| `file_name` | `text unique not null` | the md5 of the uploaded bytes, naming both stored objects. Unique across the whole table, not per shelf |
| `file_ext` | `text not null` | `check in ('jpg','png','gif','webp','avif')` |
| `file_size`, `width`, `height` | `integer not null` | of the **stored** image |
| `rating` | `text not null default 'g'` | the same two tiers, so the site-wide NSFW setting means one thing everywhere |
| `source_url` | `text` | |
| `view_count` | `integer not null default 0` | incremented by the website, one column grant |
| `created_at` | `timestamptz not null default now()` | |

`collection_posts_collection_idx` is `(collection_id, id desc)` — every read of a shelf is
"this shelf, newest first", cursored by id, because there is no search here to need
anything else.

**Invariants**

- **A collection cannot be deleted while it holds anything.** The missing `on delete
  cascade` is the enforcement; `deleteCollection` counts first only so the refusal can say
  how many are in the way. A collection is the only container this schema has, and deleting
  one by accident would take a set of images that exist nowhere else.
- **An image lives on exactly one shelf**, which `file_name unique` says as well as the
  feature does: two rows for the same bytes would be two rows pointing at one pair of
  stored objects, since the prefix is shared, and deleting either would break the other.
- The cover on a shelf card is **derived** — the newest image on it — not a column. A
  `cover_post_id` would be a circular foreign key, a null to handle on every delete, and a
  picker nobody asked for, to answer a question the newest image already answers.

**Why not a third board.** `@common/board` is a lookup of three table names per board, two
of which are about tags; a `BOARD.collection` entry would have carried a `postTags` and a
`tagCount` that every read, counter and facet then had to test for, and a `path` the search
grammar could address — which is the one thing this section must not be. The two boards are
one page twice because a generated image *is* a post. A collection is a different shape, so
it gets `@common/collections`, `@common/data/collections` and its own three routes.

---

## Roles

There is no RLS. There was, on every table, with a select policy and nothing else — the
only way to say "the anon key may read" when the key itself is public. There is no public
key any more, so the boundary is drawn where Postgres draws boundaries:

| role | held by | may |
| --- | --- | --- |
| `booru_owner` | the environment file, the migration runner only | everything, DDL included |
| `booru_app` | compiled into the desktop bundle | `select, insert, update, delete` on the ten content tables, `select, insert, update` on `site_settings`; **no** create, alter or drop |
| `booru_web` | Vercel | `select` on all eleven; `update (view_count)` on `posts`, `generative_posts` **and** `collection_posts`; nothing else |

The grants are `db/grants.sql`, re-applied on every `db:push` and applied to whichever
roles exist so a scratch database still migrates. `db/README.md` creates them.

The website's half is strictly stronger than what it replaced, where Vercel carried a
service-role key that bypassed every policy in the project in order to count views. The
desktop's is the same trust model it always had — possession of the installer is the
authorization — with one addition that matters: `booru_app` owns nothing, so a string
extracted from a bundle can vandalise the data and cannot drop a table.

Images are not in the database. They are one public R2 bucket — `posts/` and `thumbs/` for
the gallery, `generative/posts/` and `generative/thumbs/` for the other board,
`collections/posts/` and `collections/thumbs/` for the shelves, `artists/images/` and
`artists/thumbs/` for the artist list's examples — read by URL and written
only by the desktop app's bucket key.

---

## Operations

The query logic that used to be plpgsql. It moved to TypeScript because a plpgsql body
needs a migration to edit and reports one opaque error from inside a statement that was
about something else. What remains in SQL is the schema itself.

Everything below takes its database handle as an argument rather than building one —
that is what lets Electron's main process run the same code the website compiles.

### Post writes

`@common/data/shared.ts` — `createPostWithTags()`, `updatePostWithTags()`,
`deletePostRow()`. Formerly the `create_post_with_tags` / `update_post_with_tags` RPCs.

- Both write paths end in `setPostTags()`: create the tag names that are new, diff the
  wanted set against the links already stored, apply only the difference — and return
  that difference, so the caller knows exactly which tags to recount.
- **There is no transaction.** `createPostWithTags()` compensates: if tagging fails it
  deletes the post it just inserted, via `deletePostRow()`, which reads the tag links
  before the cascade removes them so the counts come back down. Preserve that unwind if
  you touch the write path.
- Each step's failure carries its own message, which is the point of the move.

### Counters

`@common/data/counters.ts` — `syncTagPostCounts(db, tagIds, board)`. Formerly the
`tag_post_count` trigger on `post_tags`.

- **Recompute, never increment.** PostgREST cannot express `post_count = post_count + 1`,
  and the read-then-write standing in for it loses concurrent updates permanently — an
  increment has no way of noticing it is behind. A recount reads the rows that define the
  number, so it is right regardless of what it finds and a stale write is repaired by the
  next one.
- **Every write must call it** with exactly the tags it moved, **and with its own board**.
  Nothing does this automatically now that the trigger is gone, and the column it recounts
  and the table it recounts from both come out of `@common/board`, so the two can never be
  picked from different boards.
- **It logs and never throws.** By the time it runs the post write has already landed;
  failing the upload afterwards would trade a wrong number for a lost image.
- `booru_app`, because that is the only role that can write at all.

### View counting

`src/lib/data/posts.ts` — `incrementPostView(postId, board)`. Formerly the
`increment_post_view` RPC, then a compare-and-swap. **The only write the website makes**,
and one statement: `update <board's table> set view_count = view_count + 1`. The board
arrives from an action, so it is checked against `BOARDS` before it names a table.

- The retry loop is gone with PostgREST. It read the count and wrote back with an
  equality check on what it had read, up to three attempts, then dropped the view —
  which is what standing in for atomicity costs when you cannot express an increment.
- It cannot recount the way the tag counter does: `view_count` is not derived from
  anything, because the rows that would define it are never stored. That is why this one
  increments and that one recomputes, and it is not an inconsistency.
- `booru_web` holds `update (view_count)` on the two post tables and no other write grant
  anywhere, so the column-level grant is what makes this safe rather than the function
  being careful.
  Called only from the `recordPostView` action, never on a read path, so prefetches,
  `generateMetadata` and crawlers don't inflate it.

### Search

`@common/data/search.ts` — `searchPosts(db, { query, perPage, after, board })`. Formerly
the `search_posts` SQL function. One implementation, run by both the website's listings —
`/posts` and `/ai-posts` — and the desktop app's browse screen. The board names the two
tables the statement below reads and changes nothing else about it: `-tag` means the same
thing on either.

**One statement**, whatever was typed:

- **All include tags** — a correlated `count(distinct pt.tag_id)` over `post_tags` joined
  to `tags`, compared against how many names were asked for. Matched by name, so nothing
  has to be resolved to ids in a round trip of its own, and a name nobody has used simply
  fails to reach the count.
- **No exclude tags** — the same join as a `not exists`, which the planner takes as an
  anti-join.
- **The rating whitelist** `resolveRatings()` produced, then `order by id desc` and
  `limit(perPage + 1)`. Two cursors narrow it, both ids and neither an offset: `id <=
  start` begins where the query's `start:` metatag says, `id < after` continues chunk to
  chunk.

**Empty arrays degrade correctly**, which is what makes it one fixed statement rather than
a query assembled from the input: `= any('{}')` matches nothing, so a count of 0 is
compared against 0 and passes, and a `not exists` over a condition nothing satisfies is
true for every row. Browsing with no query takes the same path as a three-tag search.

This replaced about a hundred lines that read every `post_tags` link the named tags
carried — in pages of a thousand, because a PostgREST request answers with one page —
intersected them in a `Map` of `Set`s and handed the surviving ids back as a literal
`in (…)` list. Multi-tag AND is the one thing PostgREST genuinely cannot say.

**Invariants**

- **Nothing counts rows.** The spare row from `perPage + 1` is the whole answer to "is
  there more". An exact count scanned the filtered set on every read to feed a page
  number that no longer exists.
- Cursors are ids, never offsets — an offset slides when an upload lands mid-scroll.

**Scaling:** fine to ~100k posts, served by `post_tags_tag_post_idx` and the primary key.
If it stops being, the fix is materialized tag arrays plus GIN — not a return to resolving
ids in TypeScript.

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
| `search_posts`, `create_post_with_tags`, `update_post_with_tags`, `increment_post_view` | plpgsql functions | See [Operations](#operations) |
| `posts.status`, `is_admin()`, `profiles.role` | a moderation tier | Dropped before the schema was squashed |

The eighteen migrations written during the build were squashed into four; those four and
the twelve after them were squashed again into one baseline when the board moved to Neon
and was emptied. Schema changes from here are **always** a new numbered
file — never a dashboard edit, and never an edit to the squashed four once they have been
pushed anywhere real.

## Deliberately not built

comments, pools, notes, tag_aliases, post_votes, moderation queue / audit log, wiki
pages, favorites, public accounts.

Tag implications, recommendations and form groups *do* exist — as
[`tag_rules`](#tag_rules), keyed by tag id so a rename carries them and a delete takes
them. Only the desktop app reads them. See
[packages/desktop/README.md](../packages/desktop/README.md).

---

## `artists`, `artist_urls`, `artist_images`

`db/migrations/0007_artists.sql`

The desktop app's reading list: an artist, the addresses they post at, a few example
images, and when they were last caught up on. **Separate from every other feature** — not a
tag, not a board, not a collection — and **not on the website**: `db/grants.sql` gives
`booru_web` no grant on any of the three, so the database refuses the read rather than a
page remembering not to make one.

| table | column | notes |
| --- | --- | --- |
| `artists` | `name text not null` | prose; `readArtistName` (`@common/artists`). `artists_name_key` is `unique (lower(name))` |
| `artists` | `is_ai boolean not null default false` | AI-generated work; the desktop screen shows one kind at a time, split in TypeScript |
| `artists` | `read_at timestamptz` | the whole of the list's order: `read_at asc nulls first, id asc` (`artists_read_idx`). Null is never read. No read/unread flag — how far behind you are is a date |
| `artist_urls` | `artist_id … on delete cascade` | |
| `artist_urls` | `url text unique not null` | normalized by `readArtistUrl`. Unique across **every** artist, so a pasted address already saved names who has it |
| `artist_images` | `artist_id … on delete cascade` | the stored objects are removed by `removeArtist` in TypeScript, which reads the names first |
| `artist_images` | `file_name text unique not null` | the md5, naming `artists/images/<md5>.<ext>` and `artists/thumbs/<md5>.avif`; unique across the table for the reason `collection_posts.file_name` is |
| `artist_images` | `file_ext`, `file_size`, `width`, `height` | of the stored image, as on a post |

**Mark as read is `read_at = now()`**, the database's clock, so two installs cannot order
one list two ways. Uploaded images only — an example is never a link to another site's
image, since the window cannot load one (CSP) and pixiv refuses the fetch without its own
`Referer`.
