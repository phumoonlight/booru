-- Phase 4: multi-tag search — AND across include_tags, NOT across exclude_tags.
-- Security invoker so RLS still applies (anonymous callers see active posts only);
-- status is pinned to 'active' regardless, since this backs public browsing.
create or replace function public.search_posts(
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
  status text,
  score integer,
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
    where p.status = 'active'
      and (p_rating is null or p.rating = any (p_rating))
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
    f.rating, f.source_url, f.status, f.score, f.created_at,
    count(*) over () as total_count
  from filtered f
  order by f.id desc
  limit p_limit
  offset p_offset;
$$;
