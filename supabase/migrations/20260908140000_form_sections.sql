-- `form_sections` — the rows the desktop tag form draws under a category, and their order.
--
-- A section began as a constant in code, moved to free text on each tag
-- (`tags.form_section`) so a board could divide a category without a build, and this is the
-- third and last move: free text has no order and no existence apart from the tags using
-- it. Both of those turned out to matter.
--
--   * **Order.** A-Z is the order of an index, not of a form. `hair color`, `hair styles`,
--     `clothes` is the order you tag in; alphabetically it is `accessory`, `body`,
--     `clothes`, `exposure`, `hair color`, which is the same rows in the order nobody
--     works.
--   * **Existence.** A section derived from the tags on it cannot be empty, so there was no
--     way to make one and then file tags into it — the plus that fills a row could only
--     appear once the row already had something in it. Naming the row first is the ordinary
--     order, exactly as it is for a tag.
--
-- `tags.form_section` stays free text and stays the link: a tag names its section, this
-- table says which sections a category has and in what order. Deliberately **not** a
-- foreign key. Reads must not assume the list — a tag naming a section this table has never
-- heard of is drawn after the listed ones rather than dropping out of the form, which is the
-- same courtesy `categoryOrder` does for a category outside `TAG_CATEGORIES`, and it is what
-- lets a section be deleted here without silently taking tags off the screen.
--
-- Keyed by `(category, name)` because that is what a section *is*: `clothes` under
-- Appearance and `clothes` under something else are two rows, and neither is the other. No
-- surrogate id, since nothing points at one — the tags point by name.
--
-- Only the desktop app reads it. The website draws a category, one heading, and has never
-- heard of any of this.
create table public.form_sections (
  category text not null,
  name     text not null,
  -- Where it sits under its category, low first. Ties broken by name, so a table written
  -- by hand with every position at 0 is alphabetical rather than arbitrary.
  --
  -- Rewritten whole for a category on every change: creating, deleting and reordering are
  -- all "this category's sections are now exactly these, in this order", which is one write
  -- to reason about instead of three, and it is what the panel that edits them sends.
  position smallint not null default 0,
  created_at timestamptz not null default now(),

  primary key (category, name)
);

-- The whole table is read at once into the window's store, the way the tag rules are, so
-- there is nothing to index beyond the key it is already ordered by.

-- RLS: public read, and no write policy — see the note in 20260826100100_posts.sql. The
-- desktop app writes on the service role. The website has no use for it: a section is a
-- fact about a form, and the only form is in that app.
alter table public.form_sections enable row level security;

create policy "form sections are publicly readable"
  on public.form_sections for select
  using (true);
