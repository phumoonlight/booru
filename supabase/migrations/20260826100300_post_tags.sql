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

-- RLS: public read, and no write policy — see the note in 20260826100100_posts.sql.
-- A post's tags are replaced rather than updated, so the service role only ever
-- inserts and deletes here.
alter table public.post_tags enable row level security;

create policy "post_tags are publicly readable"
  on public.post_tags for select
  using (true);
