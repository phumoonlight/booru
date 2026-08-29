-- `posts` — one row per uploaded image. References profiles (20260826100000).

create table public.posts (
  id bigint generated always as identity primary key,
  uploader_id uuid not null references public.profiles (id),
  -- md5 is the dedup key and the storage path; collision resistance is not what
  -- it is for. Paths derive from it, so they are never stored.
  md5 text unique not null,
  file_ext text not null check (file_ext in ('jpg', 'png', 'gif', 'webp', 'avif')),
  file_size integer not null,
  width integer not null,
  height integer not null,
  -- Free-form on purpose. The scale (general, e1..e5) lives in RATINGS in
  -- src/lib/search.ts, which is where new tiers get added; a check constraint here
  -- only meant every new tier also needed a migration.
  rating text not null default 'general',
  source_url text,
  -- Bumped only by the recordPostView action from the browser, never on a read
  -- path — prefetches, generateMetadata and crawlers must not inflate it.
  view_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index posts_uploader_id_idx on public.posts (uploader_id);
-- Recomputing a rating counter is `count(*) from posts where rating = $1`; without
-- this it is a sequential scan over a free-form text column.
create index posts_rating_idx on public.posts (rating);

-- RLS: world-readable; any signed-in user writes. Nothing is hidden from a visitor —
-- RESTRICTED_RATINGS only keeps e3–e5 out of search results and sitemap.xml.
alter table public.posts enable row level security;

create policy "posts are publicly readable"
  on public.posts for select
  using (true);

create policy "authenticated can insert posts"
  on public.posts for insert
  with check ((select auth.uid()) is not null);

create policy "authenticated can update posts"
  on public.posts for update
  using ((select auth.uid()) is not null);

create policy "authenticated can delete posts"
  on public.posts for delete
  using ((select auth.uid()) is not null);
