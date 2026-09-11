-- A second board, for images that were generated rather than drawn.
--
-- **Same shape, separate rows.** `generative_posts` is `posts` column for column, and
-- that is deliberate rather than lazy: a generated image is a post in every way the site
-- cares about — it has a rating, a thumbnail, a view count and a set of tags — so a
-- `generated boolean` on `posts` would have been the smaller migration. What that column
-- could not do is keep the two apart *by default*. Every listing, every neighbour walk,
-- every sitemap entry and every counter would have had to remember the flag, and the one
-- that forgot would quietly mix the two boards together. A separate table is the same
-- decision the grants make elsewhere in this schema: let the shape refuse it rather than
-- the code remember to.
--
-- **The vocabulary is shared and the counts are not.** Both boards point at `tags`, so a
-- tag means one thing on this board and searching `blue_hair` is the same search either
-- side — splitting the vocabulary would have been two spellings of every name, two
-- rename operations and a Tags screen that answers a different question depending on
-- which window you opened. What cannot be shared is `post_count`: a tag carried by four
-- hundred generated images and two drawn ones is not a tag with four hundred and two
-- posts on the gallery you are looking at. So the links get their own table and the count
-- gets its own column.

create table generative_posts (
  id integer generated always as identity primary key,
  -- The md5 of the uploaded bytes, as on `posts`, and the name both stored objects take:
  -- `generative/posts/{file_name}.{file_ext}` and `generative/thumbs/{file_name}.avif`.
  -- Its own prefix in the same bucket, for the reason `posts/` and `thumbs/` share one —
  -- a prefix costs nothing and a second bucket is a second public hostname.
  --
  -- `unique` here is the dedup key, and it is **per board**: the same image posted to
  -- both boards is two rows, which is correct. They would share a file name and so share
  -- neither stored object, the prefixes being different.
  file_name text unique not null,
  file_ext text not null check (file_ext in ('jpg', 'png', 'gif', 'webp', 'avif')),
  file_size integer not null,
  width integer not null,
  height integer not null,
  rating text not null default 'g',
  source_url text,
  view_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index generative_posts_rating_idx on generative_posts (rating);

-- The other half of `tags.post_count`, maintained by the same `syncTagPostCounts` with
-- the board named. Recomputed rather than incremented, for the reason the first one is.
alter table tags add column generative_post_count integer not null default 0;

create table generative_post_tags (
  post_id integer not null references generative_posts (id) on delete cascade,
  tag_id integer not null references tags (id),
  primary key (post_id, tag_id)
);

create index generative_post_tags_tag_post_idx on generative_post_tags (tag_id, post_id);
