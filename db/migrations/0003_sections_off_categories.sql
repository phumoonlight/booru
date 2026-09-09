-- ── tag_form_sections loses its category ──────────────────────────────────────
-- A section was a division *of a category*: Appearance held `hair color` and `clothes`,
-- and the form drew a category heading with its rows indented under it. It is one flat,
-- ordered list now, and the form is a list of sections with no categories in it at all.
--
-- The two were doing the same job twice and disagreeing about it. A category says what a
-- tag *is* — it is the board's own vocabulary, it is what the website draws, and it wears
-- a colour. A section says where your hand goes while tagging. Nesting the second inside
-- the first meant every row on the form had to be reached through a heading that adds
-- nothing to the question being asked, and it meant a section could not hold what a
-- category does not: `swimsuit` is General and `bikini` is General, but `bare shoulders`
-- is Appearance, and all three belong on the same row of the form. Now they can be, and a
-- tag's category is still the colour its chip is drawn in.
--
-- What this costs is the guarantee that a section's tags were all one category. Nothing
-- depended on it: the picker filtered by category *and* section, which is one filter too
-- many the moment a row is allowed to be about the picture rather than about a heading.

-- Names were unique within a category, so dropping it can collide — `clothes` under
-- Appearance and `clothes` under General are two rows and neither is the other. The lowest
-- id keeps the bare name and the rest take their old category in brackets, rather than
-- being merged: merging would move tags between rows on the board's behalf, and a name
-- somebody has to correct is visible on the Sections panel in a way a silent merge is not.
update tag_form_sections s
   set name = s.name || ' (' || s.category || ')'
 where exists (
   select 1 from tag_form_sections o where o.name = s.name and o.id < s.id
 );

alter table tag_form_sections drop constraint tag_form_sections_category_name_key;

-- `position` was per category, so every category started again at 0 and the numbers mean
-- nothing across the whole list. Renumbered by the order the form used to draw them in —
-- category, then position, then name — so a list worked out under the old shape comes out
-- the other side in the order it was worked out.
with ordered as (
  select id, (row_number() over (order by category, position, name) - 1)::smallint as pos
    from tag_form_sections
)
update tag_form_sections s set position = ordered.pos
  from ordered where ordered.id = s.id;

alter table tag_form_sections drop column category;

-- One list, so one name each. The same reason it was unique before: two rows reading the
-- same on the form is the failure a free-text label has to be defended against.
alter table tag_form_sections add constraint tag_form_sections_name_key unique (name);
