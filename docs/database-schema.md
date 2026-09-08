# Database Schema

**Source of truth:** `supabase/migrations/`, applied with `npm run db:push` (or
`db:reset` / `db:reset:remote`, which also run `supabase/seed.sql`). This document
describes them; when the two disagree, the migrations win and this file is the bug.

**Shape:**

```
posts >─── post_tags ───< tags ───< tag_rules >─── tags

tags >─── tag_form_section ───< tag_form_section_dep >─── tags
```

`tags.form_section_id` points at a section (`on delete set null`); a section's dependencies
point back at tags.

Six tables, no functions, no triggers. There is no `profiles` table: the board has no
accounts. Every write is made by the desktop app (`packages/desktop`) on a service-role
client built from a key compiled into its own bundle; the website holds the anon key and
only reads — and it reads three of the six: `tag_rules`, `tag_form_section` and
`tag_form_section_dep` are the desktop tag form's, consulted only where a post is tagged.

Migration order is foreign-key order: `20260826090000_storage_buckets` →
`100100_posts` → `100200_tags` → `100300_post_tags` → `20260906140000_tag_rules`. Each
table's file holds its columns, indexes **and** RLS policies, so nothing about one table
is spread across migrations. Everything after those is a column or a constraint at a time,
in its own timestamped file.

---

## `posts`

`supabase/migrations/20260826100100_posts.sql`

| column | type | notes |
| --- | --- | --- |
| `id` | `bigint` PK, generated always as identity | booru-style numeric ids; also the sort key and the feed's cursor |
| `file_name` | `text unique not null` | the name both stored files take. Value is the md5 of the uploaded bytes, which is what also makes it the dedup key |
| `file_ext` | `text not null` | `check in ('jpg','png','gif','webp','avif')` |
| `file_size` | `int not null` | bytes **as stored**, not as uploaded |
| `width` / `height` | `int not null` | of the stored image, read by sharp |
| `rating` | `text not null default 'g'` | `g` \| `s` \| `q` \| `e`. Free-form — no check constraint |
| `source_url` | `text` | nullable |
| `view_count` | `int not null default 0` | see [View counting](#view-counting) |
| `created_at` | `timestamptz not null default now()` | |

**Indexes:** PK on `id`; `unique` on `file_name`; `posts_rating_idx (rating)` for the
rating filter. Nothing else — `order by id desc` and the feed's `id < cursor` are both
served by the primary key, which Postgres reads backwards as cheaply as forwards.

**Invariants**

- Storage paths are derived, never stored: `posts/{file_name}.{file_ext}` and
  `post-thumbnails/{file_name}.avif` (`@common/storage`).
- `rating` is stored as one letter and written as a word. A query says
  `rating:explicit`; `RATING_NAME` in `@common/search` is the only translation, `asRating`
  reads either form, `ratingToken` writes only the word. Free-form on purpose: a new tier
  is a code change, not a migration.
- `file_size`, `width` and `height` describe the file that was stored. An image that
  compressed or got bounded to 2048 records the smaller numbers, not the uploaded ones.

## `tags`

`supabase/migrations/20260826100200_tags.sql`, plus
`supabase/migrations/20260906120000_tags_emoji.sql` and
`supabase/migrations/20260906130000_tags_mark.sql` and
`supabase/migrations/20260906140000_tag_rules.sql` and
`supabase/migrations/20260908120100_tags_drop_category2.sql` and
`supabase/migrations/20260908130000_tags_form_section.sql`

| column | type | notes |
| --- | --- | --- |
| `id` | `bigint` PK identity | `/tags/[id]` is addressed by this, so a rename never breaks a link |
| `name` | `text unique not null` | `check (name ~ '^[a-z0-9_().-]+$')` — lowercase `snake_case` |
| `category` | `text not null default 'general'` | free-form; `TAG_CATEGORIES` in `@common/tags` is the eight the app writes, each with a colour and a place in the order |

| `mark` | `text` (nullable) | what is drawn in front of the name — a colour or up to three glyphs — usually null; every read selects it |
| `form_section_id` | `smallint` (nullable) `→ tag_form_section.id on delete set null` | which row of the **desktop tag form** the tag is offered on; null is no row, which is not offered at all. The website never reads it |
| `implied_rating` | `text` (nullable) | a rating **floor** carried by this tag, stored as the letter like `posts.rating` — see [`tag_rules`](#tag_rules) |
| `post_count` | `int not null default 0` | denormalized, see [Counters](#counters) |
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
- **`category` is what the website shows; `form_section` is how the desktop form cuts it
  up.** The site draws one Appearance heading, as it always has; the form draws Appearance
  and then `hair color`, `hair styles`, `clothes`, `accessory` as rows under it, each with
  its own picker and its own ＋. Two views of one column and neither is a lie — a category
  says what a tag *is*, a row is a place to put your hand.
- **`form_section_id`, not a name.** The sections are
  [`tag_form_section`](#tag_form_section) and this points at one by id, so renaming a row
  carries every tag on it. `listTags` embeds the name beside the id, which is the one place
  the two meet — everything above it groups and draws by name, the way it does for the tag
  rules. Null is no row, which means the tag is **not offered in the form at all**: a
  category has no ＋ of its own.
- **A section travels with its tag through a recategorization.** `setTagCategory` leaves
  the column alone: there is no list for the value to be outside of, and a `dress` moved to
  another category belongs on the `clothes` row wherever it lands. The edit panel writes
  both, so a move that should also re-file it says so in the field.
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

`supabase/migrations/20260906140000_tag_rules.sql`, plus
`supabase/migrations/20260908120000_tag_rules_groups.sql`

The two answers to "this tag is on the post, what else should be?". An **implication** is
applied by itself (`white_bra` means the post is also a `bra`); a **recommendation** is
only offered, as a chip to press. `@common/data/rules.ts` reads and writes both; the
desktop app is the only thing that consults them.

There was a third, `kind = 2`, the **form group**: the tags the form should offer once this
tag is on the post, and hide otherwise. It was the right question in the wrong place — it
hid tags *inside* a row, so the row was still drawn with a ＋ that opened onto nothing — and
it is [`tag_form_section_dep`](#tag_form_section) now, said about the whole row.

| column | type | notes |
| --- | --- | --- |
| `tag_id` | `bigint not null → tags.id on delete cascade` | the tag that triggers the rule |
| `kind` | `smallint not null` | `check (kind in (0, 1))` — **0 implies, 1 recommends** |
| `target_tag_id` | `bigint not null → tags.id on delete cascade` | the tag the rule names |
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
  the way `posts.rating` does; the rule list above it carries `rating:explicit`, because
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

## `tag_form_section`

`supabase/migrations/20260908140000_form_sections.sql`, replaced by
`supabase/migrations/20260908150000_tag_form_section_ids.sql`

The rows the **desktop tag form** draws under a category, and their order. `hair color`,
`hair styles`, `clothes` under Appearance. The website has never heard of them: it draws
the category, one heading.

| column | type | notes |
| --- | --- | --- |
| `id` | `smallint` PK identity | what `tags.form_section_id` points at, so a rename carries every tag on the row |
| `category` | `text not null` | which category it divides — free-form, like `tags.category` |
| `name` | `text not null` | the row's label, lowercased and space-collapsed by `normalizeFormSection` |
| `position` | `smallint not null default 0` | where it sits under its category, low first, ties by name |
| `deps_mode` | `text not null default 'any'` | `check in ('any', 'all')` — whether the row needs one of its dependencies on the post, or all |
| `created_at` | `timestamptz not null default now()` | |
| | `unique (category, name)` | `clothes` under two categories is two rows, and neither is the other |

`tag_form_section_dep` holds what a row waits for: `(section_id, tag_id)`, both cascading.
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
- **A category's rows are written one edit at a time**, not as a list: create, rename,
  delete and reorder (`FormSectionEdit`). A list of names cannot express a rename, which is
  the whole reason the list-shaped write went.
- **A condition belongs to the row, not to a tag.** `blue archive` under Character waits for
  `blue_archive`; `hair color` waits for nothing. This is where form groups went: they said
  the same thing on the tag that triggered them and hid tags *inside* a row, leaving the row
  drawn with a ＋ that opened onto an empty picker. Implied tags satisfy a dependency, and a
  row the post already has a tag on is drawn whatever its condition says.
- **An empty section is the point.** It is drawn in the form with its ＋ and nothing on it,
  which is how the first tag gets filed into a new row — the one thing free text on each tag
  could not do. The other half is the order.
- **Order is `position`, then `name`.** The tie-break makes a table written by hand, every
  position left at its default, come out alphabetical rather than in insertion order.

## `post_tags`

`supabase/migrations/20260826100300_post_tags.sql`

| column | type | notes |
| --- | --- | --- |
| `post_id` | `bigint not null → posts.id on delete cascade` | |
| `tag_id` | `bigint not null → tags.id` | **no cascade** |
| | PK `(post_id, tag_id)` | |

**Indexes:** PK covers post→tags; `post_tags_tag_post_idx (tag_id, post_id)` covers
tag→posts and makes the recount an index-only scan.

**Invariants**

- Deleting a tag must delete its links first, or the foreign key refuses
  (`deleteTag` in `@common/data/tags.ts`).
- Deleting a post must read its links *before* the delete, or the cascade eats the list
  of tags that need recounting (`deletePostRow` in `@common/data/shared.ts`).

---

## Row Level Security

Enabled on every table, with a select policy and **nothing else**:

| table | select | insert | update | delete |
| --- | --- | --- | --- | --- |
| `posts` | public | — | — | — |
| `tags` | public | — | — | — |
| `post_tags` | public | — | — | — |
| `tag_rules` | public | — | — | — |

| bucket | public | policy |
| --- | --- | --- |
| `posts` | read | select only |
| `post-thumbnails` | read | select only |

Every write bypasses RLS on the service-role client. The anon key can therefore do
nothing but read, which is all the website does — a missing policy states that more
plainly than a policy testing a session nobody has.

---

## Operations

The query logic that used to be plpgsql. It moved to TypeScript because a plpgsql body
needs a migration to edit and reports one opaque error from inside a statement that was
about something else. What remains in SQL is the schema itself.

Everything below takes its Supabase client as an argument rather than building one —
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

`@common/data/counters.ts` — `syncTagPostCounts(client, tagIds)`. Formerly the
`tag_post_count` trigger on `post_tags`.

- **Recompute, never increment.** PostgREST cannot express `post_count = post_count + 1`,
  and the read-then-write standing in for it loses concurrent updates permanently — an
  increment has no way of noticing it is behind. A recount reads the rows that define the
  number, so it is right regardless of what it finds and a stale write is repaired by the
  next one.
- **Every write must call it** with exactly the tags it moved. Nothing does this
  automatically now that the trigger is gone.
- **It logs and never throws.** By the time it runs the post write has already landed;
  failing the upload afterwards would trade a wrong number for a lost image.
- Service role, because that is the only client that can write at all.

### View counting

`src/lib/data/posts.ts` — `incrementPostView()`. Formerly the `increment_post_view` RPC.
**The only write the website makes.**

- PostgREST can't send `view_count = view_count + 1`, so it reads the count and writes
  back with `.eq('view_count', <what it read>)` — a compare-and-swap. A concurrent view
  that landed first makes the update match no row, so it reads again, up to three
  attempts, then drops the view. Under real contention a lost view costs less than a
  retry loop holding a request open.
- It cannot recount the way the tag counter does: `view_count` is not derived from
  anything, because the rows that would define it are never stored.
- Service role, since `posts` has no update policy and an anonymous visitor's view still
  counts. Called only from the `recordPostView` action, never on a read path, so
  prefetches, `generateMetadata` and crawlers don't inflate it.

### Search

`@common/data/search.ts` — `searchPosts(client, { query, perPage, after })`. Formerly the
`search_posts` SQL function. One implementation, run by both the website's listing and the
desktop app's browse screen.

Multi-tag AND is the one thing PostgREST cannot express in a single filter, so tag
membership is resolved to plain id lists in TypeScript first and the request that follows
only filters and orders:

1. **All include tags** — read the `post_tags` links for those tag ids, in pages of 1000
   so nothing is silently truncated, and keep the posts whose distinct match count equals
   the number of tags asked for.
2. **No exclude tags** — posts carrying any of them are subtracted from the candidate
   list, or filtered out with `not.in` when there are no include tags.
3. **One posts request** — `rating` in the whitelist `resolveRatings()` produced,
   `order by id desc`, `limit(perPage + 1)`. Two cursors narrow it, both ids and neither
   an offset: `id <= from` starts where the query's `start:` metatag says, `id < after`
   continues chunk to chunk.

**Invariants**

- **Nothing counts rows.** The spare row from `perPage + 1` is the whole answer to "is
  there more". `count: 'exact'` scanned the filtered set on every read to feed a page
  number that no longer exists.
- Cursors are ids, never offsets — an offset slides when an upload lands mid-scroll.
- A provably empty query (an unknown tag name, or excludes that cancel the includes)
  returns early without asking Postgres anything.

**Scaling:** the id lists are bounded by the tags' `post_count`, and browsing with no
tags skips them entirely — that path is a single indexed read. Fine to ~100k posts.
Revisit (materialized tag arrays + GIN, or a function again) only if it gets slow.

---

## Removed, and why

Everything here is history. It is recorded so a change is not proposed twice, and none of
it is in the schema.

| gone | was | why |
| --- | --- | --- |
| `profiles` table, `handle_new_user()` trigger | one row per `auth.users` account | The board dropped its accounts. Every account was one person's, nothing displayed who uploaded what, and the desktop bundle already carried the service-role key — the login guarded a door it was not the lock for |
| `posts.uploader_id` | `uuid → profiles.id` | Never displayed anywhere on the site; went with `profiles` |
| write RLS policies | `(select auth.uid()) is not null` on every table | No session left to test |
| `rating_counts` table + 3 triggers | a counter row per rating tier | Bought a number beside four fixed filters. The facet lists the scale without counts |
| `search_posts`, `create_post_with_tags`, `update_post_with_tags`, `increment_post_view` | plpgsql functions | See [Operations](#operations) |
| `posts.status`, `is_admin()`, `profiles.role` | a moderation tier | Dropped before the schema was squashed |

The eighteen migrations written during the build were squashed into the current four
before the first deployment. Schema changes from here are **always** a new timestamped
file — never a dashboard edit, and never an edit to the squashed four once they have been
pushed anywhere real.

## Deliberately not built

comments, pools, notes, tag_aliases, post_votes, moderation queue / audit log, wiki
pages, favorites, public accounts.

Tag implications, recommendations and form groups *do* exist — as
[`tag_rules`](#tag_rules), keyed by tag id so a rename carries them and a delete takes
them. Only the desktop app reads them. See
[packages/desktop/README.md](../packages/desktop/README.md).
