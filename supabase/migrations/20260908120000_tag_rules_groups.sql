-- A third `kind` on `tag_rules`: the **form group**.
--
-- The first two kinds are about what a post carries — an implication puts a tag on, a
-- recommendation offers one. This one is about what the desktop tag form *shows*, and it
-- puts nothing anywhere: `blue_archive` groups its own cast, so the Character row offers
-- those names once `blue_archive` is on the post and does not offer them otherwise.
--
-- It exists because a category stopped being a small enough list. Character on a board
-- that follows four series is every character in all four, in one wrapped block, and the
-- ones that could possibly apply to the picture in front of you are the handful belonging
-- to the series you have already tagged. Filing them under the trigger is the only
-- grouping that knows which handful that is — which is why this replaces `tags.category2`
-- (dropped in the migration beside this one) rather than sitting next to it. That column
-- was a fixed heading typed onto each tag, so it could divide a category but never narrow
-- one: every subgroup was on screen whatever the post was about.
--
-- **Membership is what hides a tag.** A tag named by any group is offered only while one
-- of its triggers is on the post; a tag in no group is always offered, which is most of
-- them. So adding a group is subtractive — it takes its members out of the general list —
-- and that is the whole of what makes a long category readable again.
--
-- Nothing on the website reads these. A group is a fact about the form, not about the
-- vocabulary: the site groups by category, as it always did, and a post carries no trace
-- of which group its tags were picked from.
--
-- Same shape as the other two kinds — a (trigger, kind, target) edge keyed by tag id — so
-- there is no new table, no new policy and no second read. **2 is `groups`**, and
-- `RULE_KIND` in @common/data/rules.ts is still the only place any of the three numbers
-- is written.
alter table public.tag_rules drop constraint tag_rules_kind_check;

alter table public.tag_rules
  add constraint tag_rules_kind_check check (kind in (0, 1, 2));
