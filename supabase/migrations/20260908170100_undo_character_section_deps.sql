-- Takes back `20260908170000_character_section_deps.sql`.
--
-- That one linked every Character section to the copyright tag of the same name, on the
-- assumption that the old hardcoded behaviour was wanted back as data. It was not asked
-- for: the question was whether the code had gone, and it had. A dependency is a decision
-- about one row, and inventing a boardful of them from a naming coincidence is exactly the
-- kind of thing the panel's picker exists to make deliberate.
--
-- The same join, so this removes precisely what that one added and nothing else. A
-- dependency put there by hand between the two — same section, same tag — would go with it;
-- there was no time for one, and it is two clicks to put back.
delete from public.tag_form_section_dep d
using public.tag_form_section s, public.tags t
where d.section_id = s.id
  and d.tag_id = t.id
  and s.category = 'character'
  and t.category = 'copyright'
  and t.name = replace(s.name, ' ', '_');
