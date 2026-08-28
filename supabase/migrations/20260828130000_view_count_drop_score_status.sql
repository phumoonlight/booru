-- Drop posts.score and posts.status; add posts.view_count.
--
-- score was a placeholder for a voting feature that never landed. status was the
-- moderation-queue hook, but every signed-in user already manages every post
-- (20260828110000), so 'pending'/'deleted' had no way of being set — every row is
-- 'active'. Public select becomes unconditional.
--
-- view_count is bumped only by the increment_post_view() RPC, called from the
-- explicit "record a view" action — never as a side effect of reading a post.

-- The policy and the browse index both name status, so they go first ----------
drop policy if exists "active posts are publicly readable" on public.posts;

create policy "posts are publicly readable"
  on public.posts for select
  using (true);

-- (status, id desc) was the browse index; ordering by id desc alone is the PK's job
drop index if exists public.posts_status_id_idx;

alter table public.posts drop column if exists status;
alter table public.posts drop column if exists score;

alter table public.posts
  add column if not exists view_count integer not null default 0;

-- search_posts: same query minus the status filter, with view_count in place of
-- status/score. The return type changes, so it has to be dropped, not replaced.
drop function if exists public.search_posts(text[], text[], text[], integer, integer);

create function public.search_posts(
  include_tags text[] default '{}',
  exclude_tags text[] default '{}',
  p_rating text[] default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id bigint,
  md5 text,
  file_ext text,
  file_size integer,
  width integer,
  height integer,
  rating text,
  source_url text,
  view_count integer,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
set search_path = ''
as $$
  with matching as (
    -- Posts carrying every include tag: count distinct matches per post and
    -- require it to equal the number of tags asked for.
    select pt.post_id
    from public.post_tags pt
    join public.tags t on t.id = pt.tag_id
    where t.name = any (include_tags)
    group by pt.post_id
    having count(distinct pt.tag_id) = cardinality(include_tags)
  ),
  filtered as (
    select p.*
    from public.posts p
    where (p_rating is null or p.rating = any (p_rating))
      and (
        coalesce(cardinality(include_tags), 0) = 0
        or p.id in (select m.post_id from matching m)
      )
      and (
        coalesce(cardinality(exclude_tags), 0) = 0
        or not exists (
          select 1
          from public.post_tags pt
          join public.tags t on t.id = pt.tag_id
          where pt.post_id = p.id and t.name = any (exclude_tags)
        )
      )
  )
  select
    f.id, f.md5, f.file_ext, f.file_size, f.width, f.height,
    f.rating, f.source_url, f.view_count, f.created_at,
    count(*) over () as total_count
  from filtered f
  order by f.id desc
  limit p_limit
  offset p_offset;
$$;

-- Counting a view is the one write anonymous visitors may make, so this is
-- security definer: the update policy on posts still requires a signed-in user.
create or replace function public.increment_post_view(p_post_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.posts
  set view_count = view_count + 1
  where id = p_post_id;
end;
$$;
