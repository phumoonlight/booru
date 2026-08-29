-- `tags` — the tag vocabulary, with a denormalized post_count.

create table public.tags (
  id bigint generated always as identity primary key,
  name text unique not null check (name ~ '^[a-z0-9_().-]+$'),
  category text not null default 'general'
    check (category in ('general', 'artist', 'character', 'copyright', 'meta')),
  -- Maintained by syncTagPostCounts() in src/lib/data/counters.ts, not by a trigger.
  -- It recomputes rather than increments: PostgREST cannot express `post_count + 1`
  -- at all, and an increment that loses a race is wrong for good. A trigger would
  -- also abort the write that fired it, so a counter problem read as "your upload
  -- failed". `authenticated can update tags` below covers this column.
  post_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- Autocomplete: prefix search ordered by popularity
create index tags_name_prefix_idx on public.tags (name text_pattern_ops);
create index tags_post_count_idx on public.tags (post_count desc);

-- RLS: public read; authenticated writes (uploads, and the category editor)
alter table public.tags enable row level security;

create policy "tags are publicly readable"
  on public.tags for select
  using (true);

create policy "authenticated can insert tags"
  on public.tags for insert
  with check ((select auth.uid()) is not null);

create policy "authenticated can update tags"
  on public.tags for update
  using ((select auth.uid()) is not null);

create policy "authenticated can delete tags"
  on public.tags for delete
  using ((select auth.uid()) is not null);
