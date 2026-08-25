-- Phase 1 / Migration 3: enable RLS + policies (admin-only moderation era)
-- Policy matrix: docs/database-schema.md

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.tags enable row level security;
alter table public.post_tags enable row level security;

-- profiles: public read; users may update only their own username
-- (inserts happen via the security-definer handle_new_user trigger, which bypasses RLS)
create policy "profiles are publicly readable"
  on public.profiles for select
  using (true);

create policy "users can update own profile"
  on public.profiles for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Column-level guard: only username is updatable by regular users (not role)
revoke update on public.profiles from anon, authenticated;
grant update (username) on public.profiles to authenticated;

-- posts: public sees active; admin sees and manages all
create policy "active posts are publicly readable"
  on public.posts for select
  using (status = 'active' or public.is_admin());

create policy "admin can insert posts"
  on public.posts for insert
  with check (public.is_admin());

create policy "admin can update posts"
  on public.posts for update
  using (public.is_admin());

create policy "admin can delete posts"
  on public.posts for delete
  using (public.is_admin());

-- tags: public read; admin writes (normally via create_post_with_tags RPC)
create policy "tags are publicly readable"
  on public.tags for select
  using (true);

create policy "admin can insert tags"
  on public.tags for insert
  with check (public.is_admin());

create policy "admin can update tags"
  on public.tags for update
  using (public.is_admin());

create policy "admin can delete tags"
  on public.tags for delete
  using (public.is_admin());

-- post_tags: public read; admin insert/delete (no update — rows are replaced)
create policy "post_tags are publicly readable"
  on public.post_tags for select
  using (true);

create policy "admin can insert post_tags"
  on public.post_tags for insert
  with check (public.is_admin());

create policy "admin can delete post_tags"
  on public.post_tags for delete
  using (public.is_admin());
