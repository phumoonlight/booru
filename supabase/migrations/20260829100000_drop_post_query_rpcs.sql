-- Drop the three RPCs whose bodies were query logic: search_posts,
-- create_post_with_tags, update_post_with_tags.
--
-- All three now live in TypeScript — search in src/lib/data/search.ts, the two write
-- paths in src/lib/data/posts.ts — because a plpgsql body is the hardest part of this
-- stack to change: it needs a migration to edit, a deploy to try, and it reports a
-- failure as one opaque message with no way to see which statement produced it. As
-- plain PostgREST calls each step is separately visible, loggable and re-runnable, and
-- changing the search's behaviour is a code edit rather than a schema change.
--
-- What is given up is the transaction the two write functions ran in. createPostWithTags
-- compensates by deleting the post it just inserted if tagging fails, which cascades
-- post_tags and unwinds the count triggers with it.
--
-- increment_post_view() stays: it is not query logic but a single atomic
-- `view_count = view_count + 1` that anonymous visitors must be able to run, and
-- PostgREST cannot express an in-place increment without a read-modify-write race.

drop function if exists public.search_posts(text[], text[], text[], integer, integer);

drop function if exists public.create_post_with_tags(
  text, text, integer, integer, integer, text, text, text[]
);

drop function if exists public.update_post_with_tags(bigint, text, text, text[]);
