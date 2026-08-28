-- Rename the storage buckets and allow AVIF post images.
--   originals  -> posts             ({md5}.{ext}, ext is 'avif' when lossless
--                                    AVIF beat the upload, else the upload's own)
--   thumbnails -> post-thumbnails   ({md5}.avif, lossy)
--
-- The old buckets are left behind: Postgres refuses direct deletes on the
-- storage tables ("Direct deletion from storage tables is not allowed"), so
-- `originals` and `thumbnails` have to be emptied and removed from the
-- dashboard or the Storage API. Nothing is copied across — this is a
-- development-only rename, and existing posts must be re-uploaded.

-- posts.file_ext now also carries 'avif'
alter table public.posts drop constraint if exists posts_file_ext_check;
alter table public.posts
  add constraint posts_file_ext_check
  check (file_ext in ('jpg', 'png', 'gif', 'webp', 'avif'));

insert into storage.buckets (id, name, public)
values
  ('posts', 'posts', true),
  ('post-thumbnails', 'post-thumbnails', true)
on conflict (id) do nothing;

-- Policies name their buckets literally, so they have to be rewritten
drop policy if exists "public read booru buckets" on storage.objects;
drop policy if exists "authenticated write booru buckets" on storage.objects;
drop policy if exists "authenticated update booru buckets" on storage.objects;
drop policy if exists "authenticated delete booru buckets" on storage.objects;

create policy "public read booru buckets"
  on storage.objects for select
  using (bucket_id in ('posts', 'post-thumbnails'));

create policy "authenticated write booru buckets"
  on storage.objects for insert
  with check (bucket_id in ('posts', 'post-thumbnails') and (select auth.uid()) is not null);

create policy "authenticated update booru buckets"
  on storage.objects for update
  using (bucket_id in ('posts', 'post-thumbnails') and (select auth.uid()) is not null);

create policy "authenticated delete booru buckets"
  on storage.objects for delete
  using (bucket_id in ('posts', 'post-thumbnails') and (select auth.uid()) is not null);
