-- `form_sections` becomes `tag_form_section`, and a section gets an **id**.
--
-- The table was keyed by `(category, name)` and `tags.form_section` named a section as
-- text. That works until you want to rename one: the name *was* the identity, so changing
-- it made a different section, and every tag on the old row silently fell off the form.
-- The same lesson the tag rules learned when they moved off `save.json` — rows are ids so a
-- rename carries what points at them — arriving one table later.
--
-- So: a surrogate `id`, `(category, name)` demoted to a unique constraint, and
-- `tags.form_section` replaced by `tags.form_section_id`. Renaming is now one update to one
-- row and every tag follows it, which is the whole point of the change.
--
-- The name is `tag_form_section` — singular, and prefixed the way `tag_rules` is, since
-- what it divides is the tag vocabulary and it is only ever read beside it.
create table public.tag_form_section (
  id smallint primary key generated always as identity,
  category text not null,
  -- Unique *within* the category: `clothes` under Appearance and `clothes` under something
  -- else are two rows and neither is the other. It is a constraint now rather than the key,
  -- which is exactly what makes it renamable.
  name     text not null,
  -- Where it sits under its category, low first, ties by name — so a table written by hand
  -- with every position left at 0 comes out alphabetical rather than in insertion order.
  position smallint not null default 0,
  created_at timestamptz not null default now(),

  unique (category, name)
);

-- Everything the old table held, in the order it held it.
insert into public.tag_form_section (category, name, position)
select category, name, position from public.form_sections
on conflict do nothing;

-- And any section a tag names that the old table never listed — a value typed before that
-- table existed, or one deleted from it while tags still pointed at it. Those were drawn
-- after the listed rows rather than lost, so they are real sections and are carried as such
-- instead of being dropped on the way through.
insert into public.tag_form_section (category, name)
select distinct t.category, t.form_section
from public.tags t
where t.form_section is not null
on conflict do nothing;

-- `set null`, not `restrict`: deleting a section takes away a row of the form, and a tag
-- that was on it goes back to naming no section at all. That is the same answer the text
-- column gave — a deleted section never took a tag off the board with it — said structurally
-- now instead of by the read being forgiving.
alter table public.tags
  add column form_section_id smallint
    references public.tag_form_section (id) on delete set null;

update public.tags t
set form_section_id = s.id
from public.tag_form_section s
where s.category = t.category and s.name = t.form_section;

alter table public.tags drop column form_section;
drop table public.form_sections;

comment on column public.tags.form_section_id is
  'Which row of the desktop tag form this tag is offered on. Null is no row, which is not offered at all.';

-- The whole table is read at once into the window's store, the way the tag rules are, so
-- there is nothing to index beyond the key and the unique constraint already there.

-- RLS: public read, and no write policy — see the note in 20260826100100_posts.sql. The
-- desktop app writes on the service role. The website has no use for it: a section is a
-- fact about a form, and the only form is in that app.
alter table public.tag_form_section enable row level security;

create policy "tag form sections are publicly readable"
  on public.tag_form_section for select
  using (true);
