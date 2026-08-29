-- `post_tags` — the join table. References posts (20260826100100) and tags
-- (20260826100200), so it comes after both.

create table public.post_tags (
  post_id bigint not null references public.posts (id) on delete cascade,
  tag_id bigint not null references public.tags (id),
  primary key (post_id, tag_id)
);

-- PK covers post→tags; this covers tag→posts, and makes the tag-side recount in
-- syncTagPostCounts() an index-only scan.
create index post_tags_tag_post_idx on public.post_tags (tag_id, post_id);

-- RLS: public read; insert/delete only — a post's tags are replaced, never updated
alter table public.post_tags enable row level security;

create policy "post_tags are publicly readable"
  on public.post_tags for select
  using (true);

create policy "authenticated can insert post_tags"
  on public.post_tags for insert
  with check ((select auth.uid()) is not null);

create policy "authenticated can delete post_tags"
  on public.post_tags for delete
  using ((select auth.uid()) is not null);
