-- The whole schema, as one file, for a board that starts empty.
--
-- It replaces sixteen Supabase migrations and the two things they were written against:
-- PostgREST, whose embeds decided several constraint *names*, and RLS, which was how a
-- public anon key was kept to reading. Neither exists here. What replaces RLS is three
-- roles and their grants — a `grant` is the boundary Postgres is actually built to draw,
-- and unlike a missing policy it says out loud what each half of the app may do.
--
-- The grants are **not in this file**. They are `db/grants.sql`, re-applied on every
-- `db:push`, because they are desired state rather than history: roles get created after
-- a schema, recreated with new passwords, or added for a second person, and a grant
-- block that only ever ran inside one migration would have been applied exactly once,
-- before any of that happened.
--
-- The history those sixteen files carried is not lost, it is just not schema: the
-- arguments behind `tags.mark` holding two kinds of thing, behind `tag_form_sections`
-- having ids rather than names, and behind `tag_rules` being one table with a `kind`
-- column are all in CLAUDE.md and beside the code that reads them. What a squash costs
-- is the create-then-drop of `form_sections` and of `tags.category2`, which described
-- how the board arrived rather than where it is.

-- ── posts ─────────────────────────────────────────────────────────────────────
-- **Ids are `integer`, not `bigint`, and that is a decision about JavaScript.** A
-- Postgres `bigint` does not fit in a `Number`, so postgres.js hands one back as a
-- *string* — which would quietly turn `Post.id` into a lie, break every `id < cursor`
-- the feed pages by, and make a `Set` of ids match nothing. The alternatives were a
-- `::int` cast on some thirty queries, which is the same narrowing said thirty times and
-- forgettable in every new one, or a custom type parser, which fixes it in a place
-- nobody reading a query would look. Two billion posts is not this board, so the column
-- says what the code already believed.
create table posts (
  id integer generated always as identity primary key,
  -- The name both stored files are given, minus their extension: the post image is
  -- `posts/{file_name}.{file_ext}` and the thumbnail `thumbs/{file_name}.avif`, so a
  -- path is derived and never stored.
  --
  -- The value is the md5 of the uploaded bytes, which is also what makes it the dedup
  -- key — `unique` here is what stops the same image being posted twice. Collision
  -- resistance is not what the hash is for.
  file_name text unique not null,
  file_ext text not null check (file_ext in ('jpg', 'png', 'gif', 'webp', 'avif')),
  file_size integer not null,
  width integer not null,
  height integer not null,
  -- One letter: `g` or `r`. The scale lives in RATINGS in packages/common/src/search.ts,
  -- which is where a new tier gets added, and RATING_NAME beside it is how a query
  -- spells one — `?query=rating:r18` searches for 'r'.
  --
  -- Free-form on purpose, and this column is the reason to keep insisting on that: the
  -- scale has now been rewritten three times (general/e1..e5, then four names, then the
  -- letters, now two tiers) and not one of those needed a migration.
  rating text not null default 'g',
  source_url text,
  -- Bumped only by the recordPostView action from the browser, never on a read path —
  -- prefetches, generateMetadata and crawlers must not inflate it.
  view_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- The listing orders by id desc and the feed pages by `id < cursor`, both of which the
-- primary key serves. This one is for the rating filter, which every listing carries.
create index posts_rating_idx on posts (rating);

-- ── tag_form_sections ──────────────────────────────────────────────────────────
-- Which rows the desktop tag form draws under a category. Before `tags`, which points
-- at it.
--
-- A table rather than a column because the rows are *ordered*, and A–Z is an index's
-- order rather than a form's. Ids rather than names as the key because a row gets
-- renamed: the name was the identity for one revision, and correcting a spelling made a
-- different section while every tag on the old one silently fell off the form.
create table tag_form_sections (
  id smallint primary key generated always as identity,
  category text not null,
  -- Unique *within* the category: `clothes` under Appearance and `clothes` under
  -- something else are two rows and neither is the other.
  name text not null,
  -- Where it sits under its category, low first. Ties broken by name, so a table
  -- written by hand with every position left at 0 comes out alphabetical rather than in
  -- insertion order.
  position smallint not null default 0,
  -- Whether the row needs any one of its dependencies on the post, or all of them.
  deps_mode text not null default 'any' check (deps_mode in ('any', 'all')),
  created_at timestamptz not null default now(),
  unique (category, name)
);

-- ── tags ──────────────────────────────────────────────────────────────────────
create table tags (
  id integer generated always as identity primary key,
  name text unique not null check (name ~ '^[a-z0-9_().-]+$'),
  -- Free-form, the same way `posts.rating` is. TAG_CATEGORIES in
  -- packages/common/src/tags.ts is the list the app writes and draws — a new one is a
  -- line there plus a colour, and no migration. The writes still validate:
  -- `z.enum(TAG_CATEGORIES)` guards the IPC channels that set this column. The reads
  -- don't assume it — an unknown category is drawn plain and listed after the known
  -- ones rather than dropped.
  category text not null default 'general',
  -- One slot holding two kinds of thing: a `#hex` or a CSS colour name is drawn as a
  -- dot, anything else as text. `markColor` in @common/tags is the only place that
  -- decides which, so a tag looks the same on the site and in the app.
  mark text,
  -- The rating floor this tag implies, as the stored letter. One per tag, because a
  -- floor under a floor is the same rule written twice — which is why it is a column
  -- here rather than a row on `tag_rules`, where a rating is not a tag and so could not
  -- be a `target_tag_id`.
  implied_rating text,
  -- Which row of the desktop tag form this tag is offered on. Null is no row, which is
  -- not offered at all — an unfiled tag is one the vocabulary has not decided about.
  form_section_id smallint references tag_form_sections (id) on delete set null,
  -- Maintained by syncTagPostCounts() in packages/common/src/data/counters.ts, not by a
  -- trigger. It recomputes rather than increments, so a stale write is corrected by the
  -- next one; a trigger would also abort the write that fired it, so a counter problem
  -- read as "your upload failed".
  post_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- Autocomplete: prefix search ordered by popularity. `text_pattern_ops` is what makes
-- `name like 'foo%'` an index scan under a non-C collation — and it only works for
-- `like`, never `ilike`, which is why searchTags() uses the case-sensitive one. The
-- name check above is what makes that safe: a tag can only be lowercase.
--
-- Equality and `= any(...)` lookups are served by the unique constraint's own index on
-- `name`; there is deliberately no third index here.
create index tags_name_prefix_idx on tags (name text_pattern_ops);
create index tags_post_count_idx on tags (post_count desc);

-- ── tag_form_section_deps ──────────────────────────────────────────────────────
-- What a form row waits for. None and it is always drawn; otherwise it waits for any
-- one of these tags to be on the post, or for all of them, per `deps_mode` above.
create table tag_form_section_deps (
  section_id smallint not null references tag_form_sections (id) on delete cascade,
  tag_id integer not null references tags (id) on delete cascade,
  -- The whole meaning of the row, and saying it twice is saying it once. It also orders
  -- `section_id` first, which is how one section's panel reads its own dependencies.
  primary key (section_id, tag_id)
);

-- ── post_tags ─────────────────────────────────────────────────────────────────
create table post_tags (
  post_id integer not null references posts (id) on delete cascade,
  tag_id integer not null references tags (id),
  primary key (post_id, tag_id)
);

-- The PK covers post→tags; this covers tag→posts, which is what the search's
-- intersection and the tag-side recount both walk.
create index post_tags_tag_post_idx on post_tags (tag_id, post_id);

-- ── tag_rules ─────────────────────────────────────────────────────────────────
-- The two answers to "this tag is on the post, what else should be?". An **implication**
-- is applied by itself (`white_bra` means the post is also a `bra`); a **recommendation**
-- is only offered, as a chip to press.
--
-- One table, not two. The two differ in what the app does with a row and not at all in
-- its shape, so two tables would be the same columns, the same grants and the same read
-- written twice for the sake of a discriminator that is one column.
--
-- Rows are tag **ids**, so a rename carries every rule that names it and a delete takes
-- them with it. That is only safe because no write path coins a tag: `resolveTagIds`
-- refuses a name the board has no row for, so a rule can only ever name a tag that
-- exists.
create table tag_rules (
  tag_id integer not null references tags (id) on delete cascade,
  -- **0 implies, 1 recommends.** A number rather than the word, which is the one thing
  -- here a reader of the table cannot work out from it: `RULE_KIND` in
  -- @common/data/rules.ts is the mapping and the only place either number is spelled.
  kind smallint not null check (kind in (0, 1)),
  -- `target` rather than `implied` because one column serves both kinds and only one of
  -- them implies anything.
  target_tag_id integer not null references tags (id) on delete cascade,

  -- A rule is a (trigger, kind, target) edge, and saying it twice is saying it once. It
  -- also orders `tag_id, kind` first, which is how one tag's panel reads its own rules.
  --
  -- No `created_at`. Nothing asks when a rule was written — the whole set is read at
  -- once and drawn in tag order — and a column nobody reads is one more thing to keep
  -- true.
  primary key (tag_id, kind, target_tag_id),

  -- A tag implying or recommending itself is the one rule that can never do anything.
  constraint tag_rules_not_self check (tag_id <> target_tag_id)
);

-- No index on `target_tag_id`. The only thing that reads that way is the cascade when a
-- tag is deleted, which is rare and scans a table of a few hundred rows; the whole set
-- is read at once into the app's rule store either way, and "what implies this tag?" is
-- answered there, in memory.
