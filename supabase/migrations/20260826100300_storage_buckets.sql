-- Phase 1 / Migration 4: storage buckets + policies
-- originals: full-size uploads, named {md5}.{ext}
-- thumbnails: WebP thumbs, named {md5}.webp

insert into storage.buckets (id, name, public)
values
  ('originals', 'originals', true),
  ('thumbnails', 'thumbnails', true)
on conflict (id) do nothing;

-- Public read (bucket `public` flag covers direct URLs; this covers the API path)
create policy "public read booru buckets"
  on storage.objects for select
  using (bucket_id in ('originals', 'thumbnails'));

-- Writes: admin only. The upload action uses the service-role client, which
-- bypasses RLS anyway — these policies are the defense-in-depth floor.
create policy "admin write booru buckets"
  on storage.objects for insert
  with check (bucket_id in ('originals', 'thumbnails') and public.is_admin());

create policy "admin update booru buckets"
  on storage.objects for update
  using (bucket_id in ('originals', 'thumbnails') and public.is_admin());

create policy "admin delete booru buckets"
  on storage.objects for delete
  using (bucket_id in ('originals', 'thumbnails') and public.is_admin());
