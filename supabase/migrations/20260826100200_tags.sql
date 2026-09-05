-- `tags` — the tag vocabulary, with a denormalized post_count.

create table public.tags (
  id bigint generated always as identity primary key,
  name text unique not null check (name ~ '^[a-z0-9_().-]+$'),
  -- Free-form, the same way `posts.rating` is, and the desktop app's Tags screen takes
  -- it as free text. TAG_CATEGORIES in packages/common/src/tags.ts is the five that get
  -- a colour, a label and a place at the top of the display order; anything else is
  -- drawn plain and sorts after them. A check constraint here would have meant a
  -- migration for every new category.
  --
  -- The writes still validate: CATEGORY_PATTERN — letters only — guards the two IPC
  -- channels that set this column, so a category can never need escaping in a URL or a
  -- class name, and can never be confused with a tag name, which allows more.
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
