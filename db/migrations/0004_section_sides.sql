-- ── a form row knows which side it is on ──────────────────────────────────────
-- The desktop tag form is two columns, and which column a row was in used to be derived
-- from its `position`: even left, odd right. That works exactly as long as the two
-- columns are the same length, and it cannot be made to work when they are not — a list
-- of ids has no way to say "this side has one more than the other", so the surplus row
-- always came out on the wrong side of the divider. Every awkwardness the drag gesture
-- had came from that: a row could be moved within its column, and across only by trading
-- places with a row already there, because the empty space at the foot of the shorter
-- column was a place the model could not name.
--
-- So the side is a column, and `position` is the order *within* that side. Two facts
-- about a row, both authored, neither inferred from the other.
alter table tag_form_sections
  add column side smallint not null default 0 check (side in (0, 1));

-- What the parity layout was already showing, made explicit: the row that was drawn on
-- the right stays on the right, and each side is numbered from zero. A board laid out
-- under the old rule opens looking exactly as it was left.
with ordered as (
  select id, row_number() over (order by position, name) - 1 as n
    from tag_form_sections
)
update tag_form_sections s
   set side = (ordered.n % 2)::smallint,
       position = (ordered.n / 2)::smallint
  from ordered
 where ordered.id = s.id;
