-- `tags.form_section` — which row of the desktop tag form a tag is offered on.
--
-- The website shows a tag's **category** and nothing else: `appearance`, one heading, as
-- it always has. The form needs that same category cut finer, because a category is a
-- statement about what a tag *is* and a form row is a place to put your hand — one row
-- called Appearance holding hair colours, hair styles, garments and jewellery is a row
-- you have to read rather than aim at. So the form draws Appearance as a heading and
-- `hair color`, `hair styles`, `clothes`, `accessory` as rows under it, each with its own
-- picker and its own plus. Two views of one column, and neither is a lie.
--
-- This is `tags.category2` reconsidered, not restored. That column was a free-text
-- heading *inside* one picker: it divided the list you were already looking at, and it was
-- dropped because a heading cannot shorten a category — every subgroup was drawn whatever
-- the post was about. Two things are different here.
--
--   1. A section is a **row of the form**, not a heading in a picker. Its plus is a target,
--      and the picker it opens offers that section alone.
--   2. It is not the thing that narrows the picker any more. The form groups on
--      `tag_rules` do that, per post; this only decides which row a tag is drawn on. That
--      is the whole of what `category2` was asked to do and could not.
--
-- Like `category2` it is free text with no list in code, and deliberately: how a category
-- wants dividing is a judgement about one board's own vocabulary, made while looking at it,
-- and a constant would put every change of mind behind a build and an installer. The
-- spelling is settled by `normalizeFormSection` and the field that writes it offers what
-- the category already uses, which is what keeps `hair colour` from landing beside
-- `hair color`.
--
-- Nullable, and null is ordinary: a tag with nothing here is offered on its category's own
-- row, above the sections. A section comes into being by being typed onto a tag and stops
-- existing when the last tag leaves it, so the rows the form draws and the rows this column
-- holds are the same set by construction — nothing can be filed onto a row that is not
-- drawn, and no chip can fall between two rows.
--
-- Only the desktop app reads it. Nothing about search, storage, the website or a post's
-- own page knows this column exists.
alter table public.tags add column form_section text;

comment on column public.tags.form_section is
  'Which row of the desktop tag form this tag is offered on, inside its category. Null is the category row itself.';
