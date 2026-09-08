-- Form groups go; form sections get **dependencies**.
--
-- A form group was `tag_rules` kind 2: `blue_archive` names its cast, and those tags are
-- hidden from the picker until `blue_archive` is on the post. It answered a real question —
-- a board following four series has four casts under Character and only one of them can
-- apply — and it answered it in the wrong place. A group hid *tags inside a row*, so the row
-- was still drawn, still had its ＋, and opened onto a picker that was empty for reasons the
-- picker could not state. Worse, the rule was written on the tag it hung off, which is the
-- one screen where you are not thinking about the form.
--
-- A section can say the same thing about the whole row, which is the thing that should
-- appear and disappear: **`hair color` always shows; `blue archive` shows when
-- `blue_archive` is on the post.** So the condition moves onto the section, where the row
-- it governs is the thing being edited, and the group is deleted rather than kept beside it
-- — two mechanisms for one question is how a board ends up with a tag hidden by one and
-- shown by the other.
--
-- It also retires a hardcoded special case in the tag field: Character used to match its
-- sections against the post's copyright tags by name, `blue_archive` opening `blue archive`.
-- That is exactly one dependency, spelled in code, for one pair of categories. Now it is a
-- row you can see and change.
delete from public.tag_rules where kind = 2;

alter table public.tag_rules drop constraint tag_rules_kind_check;

alter table public.tag_rules
  add constraint tag_rules_kind_check check (kind in (0, 1));

-- How the dependencies below combine. Two words rather than a boolean because the row reads
-- as what it means — `all` on a section depending on `blue_archive` and `swimsuit` is a
-- swimsuit page of one series, `any` is the cast of two series in one row — and a third
-- combination, if there is ever one, is a value rather than a second column.
--
-- Checked here rather than left free-form, unlike `tags.category`: that column is a
-- vocabulary a board grows, this is a switch with two positions and no more.
alter table public.tag_form_section
  add column deps_mode text not null default 'any'
    check (deps_mode in ('any', 'all'));

comment on column public.tag_form_section.deps_mode is
  'Whether the section needs any one of its dependencies on the post, or all of them.';

-- What a section waits for. Tag **ids**, so a rename carries the dependency and a delete
-- takes it — the same reason `tag_rules` is keyed by id, and it is only safe because no
-- write path coins a tag (`resolveTagIds` refuses a name the board has no row for).
--
-- A section with no rows here has no condition and is always drawn, which is what most
-- sections are: `hair color` is not about any one series.
create table public.tag_form_section_dep (
  section_id smallint not null
    references public.tag_form_section (id) on delete cascade,
  tag_id bigint not null
    references public.tags (id) on delete cascade,

  -- The whole meaning of the row, and saying it twice is saying it once. It also orders
  -- `section_id` first, which is how one section's panel reads its own dependencies.
  primary key (section_id, tag_id)
);

-- No index on `tag_id`. The only thing that reads that way is the cascade when a tag is
-- deleted; the whole table is read at once into the window's store, the way the tag rules
-- are, and "which sections wait for this tag?" is answered there, in memory. The same
-- reasoning as the deliberate absence of one on `tag_rules.target_tag_id`.

-- RLS: public read, and no write policy — see the note in 20260826100100_posts.sql. The
-- desktop app writes on the service role, and the website has never heard of any of this.
alter table public.tag_form_section_dep enable row level security;

create policy "form section deps are publicly readable"
  on public.tag_form_section_dep for select
  using (true);
