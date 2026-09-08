-- The Character↔copyright link, moved from code into data.
--
-- The tag field used to match Character's sections against the post's copyright tags by
-- name — `blue_archive` in Copyright opening the `blue archive` row under Character — with
-- `others` always drawn. That was one dependency, in `any` mode, hardcoded for one pair of
-- categories, and it went when sections got dependencies of their own
-- (`20260908160000_section_deps.sql`). This is the same statement said as rows.
--
-- The join is the correspondence the code used and nothing cleverer: a section's name with
-- its spaces back as underscores is the tag's name. `deps_mode` is left at its default of
-- `any`, which is what the old behaviour was — one copyright is enough to open its cast.
--
-- Character only. Generalising it to "any section whose name matches a tag anywhere" would
-- link rows nobody asked to link, and every other section can be given a dependency on the
-- Sections panel in two clicks.
--
-- `others`, and any row named after nothing, comes out of this with no dependency and is
-- therefore always drawn — which is exactly what the code did with it, arrived at by the
-- general rule rather than by naming it.
--
-- Idempotent, and a no-op on a board that has no Character sections yet: it links what is
-- there when it runs. Sections made afterwards are linked by hand, which is the ordinary
-- way and the reason that panel has a picker.
insert into public.tag_form_section_dep (section_id, tag_id)
select s.id, t.id
from public.tag_form_section s
join public.tags t
  on t.category = 'copyright'
 and t.name = replace(s.name, ' ', '_')
where s.category = 'character'
on conflict do nothing;
