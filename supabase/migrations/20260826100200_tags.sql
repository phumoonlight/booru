-- `tags` — the tag vocabulary, with a denormalized post_count.

create table public.tags (
  id bigint generated always as identity primary key,
  name text unique not null check (name ~ '^[a-z0-9_().-]+$'),
  -- Free-form, the same way `posts.rating` is. TAG_CATEGORIES in
  -- packages/common/src/tags.ts is the list the app writes and draws — a new one is a
  -- line there plus the colour and label it needs to be visible at all, and no migration.
  -- A check constraint here only meant every such change also needed one.
  --
  -- The writes still validate: `z.enum(TAG_CATEGORIES)` guards the two IPC channels that
  -- set this column, so an unknown value can only arrive by hand-editing the table. The
  -- reads don't assume it — such a row is drawn plain and listed after the known ones
  -- rather than dropped, which is what mapping over the list alone used to do.
  category text not null default 'general',
  -- Maintained by syncTagPostCounts() in packages/common/src/data/counters.ts, not by
  -- a trigger.
  -- It recomputes rather than increments: PostgREST cannot express `post_count + 1`
  -- at all, and an increment that loses a race is wrong for good. A trigger would
  -- also abort the write that fired it, so a counter problem read as "your upload
  -- failed".
  post_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- Autocomplete: prefix search ordered by popularity. `text_pattern_ops` is what makes
-- `name like 'foo%'` an index scan under a non-C collation — and it only works for
-- `like`, never `ilike`, which is why searchTags() in @common/data/shared.ts uses the
-- case-sensitive one. The name check above is what makes that safe.
--
-- Equality and `in (…)` lookups are served by the unique constraint's own index on
-- `name`; there is deliberately no third index here.
create index tags_name_prefix_idx on public.tags (name text_pattern_ops);
create index tags_post_count_idx on public.tags (post_count desc);

-- RLS: public read, and no write policy — see the note in 20260826100100_posts.sql.
-- The desktop app writes these on the service role; the website only reads.
alter table public.tags enable row level security;

create policy "tags are publicly readable"
  on public.tags for select
  using (true);
