-- `posts` — one row per uploaded image. First of the three table migrations.
--
-- Together with 20260826090000_storage_buckets.sql these replace the 18 incremental
-- migrations written while the app was being built; most of that history was features
-- added and then taken back out (an admin/member role split, a Google-OAuth allow-list,
-- moderation columns, the search and post-write RPCs), and only the end state is here.
--
-- There is no `profiles` table and no `uploader_id`. The board had Supabase Auth behind
-- it, a row per user and an `auth.uid() is not null` test on every write; the accounts
-- were all one person's, nothing on the site ever displayed who uploaded what, and the
-- desktop app that does the writing already carries the service-role key in its bundle.
-- So the login was a step that guarded nothing the key didn't already open. Writes now
-- have no policy at all — see the RLS note below.

create table public.posts (
  id bigint generated always as identity primary key,
  -- The name both stored files are given, minus their extension: the post image is
  -- `posts/{file_name}.{file_ext}` and the thumbnail `post-thumbnails/{file_name}.avif`,
  -- so a path is derived and never stored.
  --
  -- The value is the md5 of the uploaded bytes, which is also what makes it the dedup
  -- key — `unique` here is what stops the same image being posted twice. Collision
  -- resistance is not what the hash is for.
  file_name text unique not null,
  file_ext text not null check (file_ext in ('jpg', 'png', 'gif', 'webp', 'avif')),
  file_size integer not null,
  width integer not null,
  height integer not null,
  -- One letter: g, s, q or e. The scale lives in RATINGS in
  -- packages/common/src/search.ts, which is where new tiers get added, and RATING_NAME
  -- beside it is how a query spells one — `?query=rating:explicit` searches for 'e'.
  -- Free-form on purpose: a check constraint here only meant every new tier also needed
  -- a migration.
  rating text not null default 'g',
  source_url text,
  -- Bumped only by the recordPostView action from the browser, never on a read
  -- path — prefetches, generateMetadata and crawlers must not inflate it.
  view_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- The listing orders by id desc and the feed pages by `id < cursor`, both of which the
-- primary key serves. This one is for the rating facet's filter.
create index posts_rating_idx on public.posts (rating);

-- RLS: world-readable, and nothing else. Nothing is hidden from a visitor —
-- RESTRICTED_RATINGS only keeps the adult tiers out of search results and sitemap.xml.
--
-- There is deliberately no insert, update or delete policy on any table in this schema.
-- Every write is made by the desktop app on the service-role client, which bypasses RLS
-- entirely; the anon key the website holds can therefore do nothing but read, which is
-- all the website does. A missing policy is a stronger statement than a policy testing
-- a session that no longer exists.
alter table public.posts enable row level security;

create policy "posts are publicly readable"
  on public.posts for select
  using (true);
