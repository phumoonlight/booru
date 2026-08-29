-- Storage: the two buckets and their policies. The `public` tables follow, one
-- migration each, starting with 20260826100000_profiles.sql.
--
-- Kept separate because this writes `storage.*`, not `public.*` — a different
-- extension-owned schema, with its own failure modes (the storage tables refuse direct
-- deletes, so a bucket that goes wrong is cleaned up from the dashboard or the Storage
-- API, never from here). It runs first because nothing here depends on the app's
-- tables: the policies test `bucket_id` and `auth.uid()` and nothing else.
--
--   posts            {md5}.{ext} — lossless AVIF when it beat the uploaded bytes,
--                    otherwise the original byte-for-byte
--   post-thumbnails  {md5}.avif  — lossy, 400px tall

insert into storage.buckets (id, name, public)
values
  ('posts', 'posts', true),
  ('post-thumbnails', 'post-thumbnails', true)
on conflict (id) do nothing;

-- Public read (the bucket `public` flag covers direct URLs; this covers the API path)
create policy "public read booru buckets"
  on storage.objects for select
  using (bucket_id in ('posts', 'post-thumbnails'));

-- Writes go through the service-role client, which bypasses RLS anyway — these
-- policies are the defense-in-depth floor.
create policy "authenticated write booru buckets"
  on storage.objects for insert
  with check (bucket_id in ('posts', 'post-thumbnails') and (select auth.uid()) is not null);

create policy "authenticated update booru buckets"
  on storage.objects for update
  using (bucket_id in ('posts', 'post-thumbnails') and (select auth.uid()) is not null);

create policy "authenticated delete booru buckets"
  on storage.objects for delete
  using (bucket_id in ('posts', 'post-thumbnails') and (select auth.uid()) is not null);
