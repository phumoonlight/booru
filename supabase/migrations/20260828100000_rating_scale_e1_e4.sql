-- Rating scale swap: general / sensitive / questionable / explicit
--             ->    general / e1 / e2 / e3 / e4
--
-- The old three-tier adult scale maps onto the bottom three E levels, so nothing
-- that was gated becomes public: `explicit` lands on e3, which stays restricted
-- alongside the new top tier e4.

alter table public.posts drop constraint if exists posts_rating_check;

update public.posts
set rating = case rating
  when 'sensitive' then 'e1'
  when 'questionable' then 'e2'
  when 'explicit' then 'e3'
  else rating
end
where rating in ('sensitive', 'questionable', 'explicit');

alter table public.posts
  add constraint posts_rating_check
  check (rating in ('general', 'e1', 'e2', 'e3', 'e4'));
