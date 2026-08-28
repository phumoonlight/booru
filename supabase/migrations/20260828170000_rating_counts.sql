-- A counter row per rating, so the sidebar's rating facet is an O(1) read.
--
-- It used to be six `count(*)` queries over posts on every home-page render — with no
-- index on `rating` that is six sequential scans, and exact counts only get slower as
-- the table grows. This mirrors what tags already do: `tags.post_count` is denormalized
-- and kept current by a trigger (20260826100100), and this is the same pattern for
-- ratings. The write path pays a single-row update; readers pay nothing.

create table public.rating_counts (
  rating text primary key,
  post_count integer not null default 0 check (post_count >= 0)
);

-- Seed the whole UI scale, so every tier has a row (and a 0) before its first upload.
-- `rating` is free-form text since 20260828160000, so a value outside this list is
-- still counted — the trigger inserts a row for it on demand.
insert into public.rating_counts (rating, post_count)
select r, 0 from unnest(array['general', 'e1', 'e2', 'e3', 'e4', 'e5']) as r
on conflict (rating) do nothing;

-- Backfill from the posts already in the table
insert into public.rating_counts (rating, post_count)
select rating, count(*) from public.posts group by rating
on conflict (rating) do update set post_count = excluded.post_count;

-- Keep rating_counts in sync with posts
create or replace function public.rating_count_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    update public.rating_counts
    set post_count = greatest(post_count - 1, 0)
    where rating = old.rating;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    insert into public.rating_counts as rc (rating, post_count)
    values (new.rating, 1)
    on conflict (rating) do update set post_count = rc.post_count + 1;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- `update of rating` plus the WHEN guard keeps ordinary edits (view_count bumps, source
-- fixes) from touching the counters at all.
create trigger posts_rating_count_ins
  after insert on public.posts
  for each row execute function public.rating_count_update();

create trigger posts_rating_count_del
  after delete on public.posts
  for each row execute function public.rating_count_update();

create trigger posts_rating_count_upd
  after update of rating on public.posts
  for each row
  when (new.rating is distinct from old.rating)
  execute function public.rating_count_update();

-- Public read, no client writes: only the security-definer trigger above maintains it
alter table public.rating_counts enable row level security;

create policy "rating counts are publicly readable"
  on public.rating_counts for select
  using (true);
