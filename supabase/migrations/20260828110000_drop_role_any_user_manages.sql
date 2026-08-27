-- Drop profiles.role: every signed-in user may upload and manage posts.
--
-- The admin/member split is replaced by a plain "is authenticated?" test, so the
-- `is_admin()` helper and everything built on it (RLS policies, the RPCs' internal
-- guard, storage write policies) collapses to `auth.uid() is not null`.

-- posts -----------------------------------------------------------------------
drop policy if exists "active posts are publicly readable" on public.posts;
drop policy if exists "admin can insert posts" on public.posts;
drop policy if exists "admin can update posts" on public.posts;
drop policy if exists "admin can delete posts" on public.posts;

create policy "active posts are publicly readable"
  on public.posts for select
  using (status = 'active' or (select auth.uid()) is not null);

create policy "authenticated can insert posts"
  on public.posts for insert
  with check ((select auth.uid()) is not null);

create policy "authenticated can update posts"
  on public.posts for update
  using ((select auth.uid()) is not null);

create policy "authenticated can delete posts"
  on public.posts for delete
  using ((select auth.uid()) is not null);

-- tags ------------------------------------------------------------------------
drop policy if exists "admin can insert tags" on public.tags;
drop policy if exists "admin can update tags" on public.tags;
drop policy if exists "admin can delete tags" on public.tags;

create policy "authenticated can insert tags"
  on public.tags for insert
  with check ((select auth.uid()) is not null);

create policy "authenticated can update tags"
  on public.tags for update
  using ((select auth.uid()) is not null);

create policy "authenticated can delete tags"
  on public.tags for delete
  using ((select auth.uid()) is not null);

-- post_tags -------------------------------------------------------------------
drop policy if exists "admin can insert post_tags" on public.post_tags;
drop policy if exists "admin can delete post_tags" on public.post_tags;

create policy "authenticated can insert post_tags"
  on public.post_tags for insert
  with check ((select auth.uid()) is not null);

create policy "authenticated can delete post_tags"
  on public.post_tags for delete
  using ((select auth.uid()) is not null);

-- storage ---------------------------------------------------------------------
drop policy if exists "admin write booru buckets" on storage.objects;
drop policy if exists "admin update booru buckets" on storage.objects;
drop policy if exists "admin delete booru buckets" on storage.objects;

create policy "authenticated write booru buckets"
  on storage.objects for insert
  with check (bucket_id in ('originals', 'thumbnails') and (select auth.uid()) is not null);

create policy "authenticated update booru buckets"
  on storage.objects for update
  using (bucket_id in ('originals', 'thumbnails') and (select auth.uid()) is not null);

create policy "authenticated delete booru buckets"
  on storage.objects for delete
  using (bucket_id in ('originals', 'thumbnails') and (select auth.uid()) is not null);

-- RPCs: swap the internal admin guard for an authenticated guard ---------------
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
  if auth.uid() is null then
    raise exception 'authentication required';
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
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  update public.posts
  set rating = p_rating,
      source_url = nullif(p_source_url, '')
  where id = p_post_id;

  if not found then
    raise exception 'post % not found', p_post_id;
  end if;

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

-- Nothing references the helper or the column any more -------------------------
drop function if exists public.is_admin();

alter table public.profiles drop column if exists role;
