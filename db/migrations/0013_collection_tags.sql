-- Tags again, and this time they belong to a shelf.
--
-- The vocabulary in `tags` is board-wide: one row per name, unique across everything, with
-- a category, a mark, a rating floor and a row of a form to be offered on. That was right
-- for two galleries anybody searched and is wrong for what the site became — a shelf is a
-- set somebody assembled, and the words worth putting on its images are that shelf's own.
-- `character` means one thing on a shelf of one series and another on the next, and a
-- global table cannot hold both without a disambiguation nobody wants to type.
--
-- So these are new tables rather than a link table into `tags`, which is what a shared
-- vocabulary would have been. `tags` is left exactly where 0012 left it: dormant, kept for
-- a later use, and not this one.
--
-- **No `post_count` column.** A tag's count is `count(*)` in the read that draws the pills,
-- for the reason a shelf's image count is: a counter is a second answer that can disagree
-- with the first, and this table is a handful of rows per shelf.

create table collection_tags (
  id integer generated always as identity primary key,
  -- **`on delete cascade`, unlike `collection_posts.collection_id`.** The rule that a shelf
  -- cannot be deleted while it holds anything (invariant 14) is about images, which exist
  -- nowhere else; a tag is a word about this shelf and has no meaning without it. A shelf
  -- can only be deleted empty anyway, so what cascades here is the tags of a shelf that
  -- already holds nothing.
  collection_id integer not null references collections (id) on delete cascade,
  -- The same grammar as `tags.name` — lowercase, digits and `_().-` — settled by
  -- `readCollectionTagName` in `@common/collections`, which goes through the same
  -- `parseTagInput` the vocabulary does. A shelf's *name* is prose because a person reads
  -- it as a title; a tag is a token that gets typed, filtered on and put in a URL.
  name text not null check (name ~ '^[a-z0-9_().-]+$'),
  -- Drawn in front of the name: a colour, painted as a dot, or anything else, drawn as
  -- itself — an emoji, `[WIP]`, a year. One slot for both, the way `tags.mark` is, and
  -- `markColor` in `@common/tags` is still the only thing that decides which. Freer than
  -- `tags.mark` in what text it takes, the way `collections.mark` is; settled by
  -- `readCollectionTagMark`. Null for none.
  mark text,
  created_at timestamptz not null default now()
);

-- Unique **per shelf**, and case-insensitively, the way `collections_name_key` is: two
-- shelves may both have `landscape`, and one shelf may not have it twice.
create unique index collection_tags_name_key on collection_tags (collection_id, lower(name));

-- The pill bar's read: this shelf's tags, A–Z.
create index collection_tags_collection_idx on collection_tags (collection_id, name);

create table collection_post_tags (
  -- Both cascade. Deleting an image takes its tags off it, and deleting a tag takes it off
  -- every image — neither leaves anything worth keeping, and neither is the container
  -- invariant 14 is about.
  post_id integer not null references collection_posts (id) on delete cascade,
  tag_id integer not null references collection_tags (id) on delete cascade,
  primary key (post_id, tag_id)
);

-- The filter reads the other way round — "which images carry this tag" — and the primary
-- key above only indexes `post_id` first.
create index collection_post_tags_tag_idx on collection_post_tags (tag_id, post_id desc);
