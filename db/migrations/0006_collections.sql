-- Collections: named sets of images that are not posts.
--
-- **Not a third board.** A board (`@common/board`) is a table of posts, a link table into
-- the shared vocabulary and a column counting it — and the whole point of the second one
-- is that a generated image *is* a post: it has tags, it is searched, it appears in a
-- listing under the same grammar. A collection post is none of that. It carries no tags,
-- it is never searched, it belongs to exactly one collection, and it is deliberately
-- absent from the galleries: it is the niche piece that would only dilute a tag if it were
-- filed under one. So it gets its own two tables and its own small set of reads, rather
-- than a third entry in `BOARD` whose `postTags` and `tagCount` would have to be null and
-- whose absence from every listing would have to be remembered at every call site.
--
-- What it keeps from a post is what the *site* needs to draw one: the md5 name, the two
-- stored objects derived from it, the dimensions, a rating and a view count. Those are
-- properties of an image on a page, not of the tag vocabulary, so they are the same
-- columns here.

create table collections (
  id integer generated always as identity primary key,
  -- A person's name for a set of pictures, so it is prose and not a tag: spaces, capitals
  -- and punctuation are all fine. `@common/collections`'s `readCollectionName` settles the
  -- spelling — trimmed, whitespace collapsed, 64 characters.
  name text not null,
  created_at timestamptz not null default now(),
  -- What the list is ordered by, and the reason this column exists rather than the list
  -- being ordered by `created_at`: a collection is most interesting when something just
  -- happened to it. Touched by a rename and by every post added or removed — in
  -- TypeScript, by `touchCollection`, because this schema has no triggers and a shelf's
  -- ordering is not worth the first one.
  updated_at timestamptz not null default now()
);

-- Case-insensitive, so `Sketches` and `sketches` cannot both exist. A unique index rather
-- than `unique` on the column: the near-duplicate is the thing worth refusing, and a
-- collection is named by hand in a dialog where the existing names are on the screen
-- behind it.
create unique index collections_name_key on collections (lower(name));

-- The list's own order. `updated_at desc` is what `listCollections` reads by, with the id
-- as the tiebreak two collections touched in the same statement need.
create index collections_updated_idx on collections (updated_at desc, id desc);

create table collection_posts (
  id integer generated always as identity primary key,
  -- **No `on delete cascade`, on purpose.** "A collection cannot be deleted until every
  -- image inside it has been" is the rule, and this is it: the delete is refused by the
  -- foreign key, so the count check in `deleteCollection` is the good error message rather
  -- than the enforcement. A cascade here would silently destroy a set of images along with
  -- a row somebody meant to tidy up.
  collection_id integer not null references collections (id),
  -- The md5 of the uploaded bytes, as on `posts`, naming both stored objects:
  -- `collections/posts/{file_name}.{file_ext}` and `collections/thumbs/{file_name}.avif`.
  --
  -- `unique` across the whole table and not per collection, which is the schema saying the
  -- thing the feature says: an image lives in exactly one collection. Two rows for the
  -- same bytes would also be two rows pointing at one pair of objects, since the prefix is
  -- shared — deleting either would break the other.
  file_name text unique not null,
  file_ext text not null check (file_ext in ('jpg', 'png', 'gif', 'webp', 'avif')),
  file_size integer not null,
  width integer not null,
  height integer not null,
  -- The same two tiers the boards have, and for the same reason: the NSFW setting is
  -- site-wide, so a section that ignored it would be the one place the checkbox does not
  -- mean what it says.
  rating text not null default 'g',
  source_url text,
  view_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- Every read of a collection's contents is "this collection, newest first", cursored by
-- id — there is no search here to need anything else.
create index collection_posts_collection_idx on collection_posts (collection_id, id desc);
