-- Phase 2: transactional RPCs for creating and editing posts with tags.
-- Both are security definer but verify the caller is admin internally —
-- never rely on the client only calling them from admin UI.

create or replace function public.create_post_with_tags(
  p_md5 text,
  p_file_ext text,
  p_file_size integer,
  p_width integer,
  p_height integer,
  p_rating text,
  p_source_url text,
  p_tags text[]
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_id bigint;
  v_tag text;
  v_tag_id bigint;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  insert into public.posts
    (uploader_id, md5, file_ext, file_size, width, height, rating, source_url)
  values
    (auth.uid(), p_md5, p_file_ext, p_file_size, p_width, p_height, p_rating,
     nullif(p_source_url, ''))
  returning id into v_post_id;

  foreach v_tag in array p_tags loop
    insert into public.tags (name) values (v_tag)
    on conflict (name) do nothing;

    select id into v_tag_id from public.tags where name = v_tag;

    insert into public.post_tags (post_id, tag_id)
    values (v_post_id, v_tag_id)
    on conflict do nothing;
  end loop;

  return v_post_id;
end;
$$;

-- Replace a post's tag set and update rating/source. Tag rows themselves are kept
-- even at post_count 0 (cheap; cleanup can come later).
create or replace function public.update_post_with_tags(
  p_post_id bigint,
  p_rating text,
  p_source_url text,
  p_tags text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tag text;
  v_tag_id bigint;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  update public.posts
  set rating = p_rating,
      source_url = nullif(p_source_url, '')
  where id = p_post_id;

  if not found then
    raise exception 'post % not found', p_post_id;
  end if;

  -- Remove tags no longer present (fires the post_count trigger)
  delete from public.post_tags pt
  where pt.post_id = p_post_id
    and not exists (
      select 1 from public.tags t
      where t.id = pt.tag_id and t.name = any (p_tags)
    );

  foreach v_tag in array p_tags loop
    insert into public.tags (name) values (v_tag)
    on conflict (name) do nothing;

    select id into v_tag_id from public.tags where name = v_tag;

    insert into public.post_tags (post_id, tag_id)
    values (p_post_id, v_tag_id)
    on conflict do nothing;
  end loop;
end;
$$;
