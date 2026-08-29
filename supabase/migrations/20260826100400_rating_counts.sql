-- `rating_counts` — a counter row per rating, so the sidebar's rating facet is an O(1)
-- read instead of six count(*) scans on every home-page render. Same idea as
-- tags.post_count. The seed below reads `posts`, so this comes after 20260826100100.

create table public.rating_counts (
  rating text primary key,
  post_count integer not null default 0 check (post_count >= 0)
);

-- Seed the whole UI scale so every tier has a row (and a 0) before its first upload.
-- A rating outside this list is still counted — syncRatingCounts() upserts a row for it
-- on demand, since `posts.rating` is free-form text.
insert into public.rating_counts (rating, post_count)
select r, 0 from unnest(array['general', 'e1', 'e2', 'e3', 'e4', 'e5']) as r
on conflict (rating) do nothing;

-- RLS: read-only to every session, and that select policy is load-bearing —
-- getRatingCounts() (src/lib/data/search.ts) reads this on the anon-key client, and RLS
-- with no policy returns an empty result rather than an error, so the facet would
-- silently render zeros.
--
-- There is deliberately no write policy. syncRatingCounts() writes on the service-role
-- client, behind the requireUser() the post write already passed; a write policy here
-- would hand every signed-in session an endpoint for setting the facet counts to
-- whatever it likes, in exchange for nothing.
alter table public.rating_counts enable row level security;

create policy "rating counts are publicly readable"
  on public.rating_counts for select
  using (true);
