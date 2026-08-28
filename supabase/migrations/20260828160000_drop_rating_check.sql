-- Drops the rating check constraint: `rating` is now free-form text.
-- The allowed set lives in application code (RATINGS in src/lib/search.ts), which is
-- where new tiers get added; keeping a second copy in the database only meant every
-- tier needed a migration too. Existing rows are untouched.

alter table public.posts drop constraint if exists posts_rating_check;
