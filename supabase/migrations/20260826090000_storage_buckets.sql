-- Storage: the two buckets and their policies. The `public` tables follow, one
-- migration each, starting with 20260826100100_posts.sql.
--
-- Kept separate because this writes `storage.*`, not `public.*` — a different
-- extension-owned schema, with its own failure modes (the storage tables refuse direct
-- deletes, so a bucket that goes wrong is cleaned up from the dashboard or the Storage
-- API, never from here). It runs first because nothing here depends on the app's
-- tables: the policies test `bucket_id` and nothing else.
--
--   posts            {file_name}.{ext} — lossless AVIF when it beat the uploaded bytes,
--                    otherwise the original byte-for-byte
--   post-thumbnails  {file_name}.avif  — lossy, 400px tall

insert into storage.buckets (id, name, public)
values
  ('posts', 'posts', true),
  ('post-thumbnails', 'post-thumbnails', true)
on conflict (id) do nothing;

-- Public read (the bucket `public` flag covers direct URLs; this covers the API path)
create policy "public read booru buckets"
  on storage.objects for select
  using (bucket_id in ('posts', 'post-thumbnails'));

-- No write policy. Objects are written and deleted by the desktop app on the
-- service-role client, which bypasses RLS; there is no session left for a policy to
-- test, and the anon key the website holds should be able to do nothing here but read.
