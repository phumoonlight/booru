-- Move the last two counter triggers into TypeScript: tag_post_count_update() and
-- rating_count_update().
--
-- Same reasoning as 20260829100000 and 20260829120000. A plpgsql body needs a
-- migration to edit and reports one opaque error from inside a statement that was
-- meant to be about something else — a failed count aborted the insert that
-- triggered it, so a counter problem read as "your upload failed". What replaces
-- them (src/lib/data/counters.ts) is a step you can see, log and re-run, and it
-- fails on its own without taking the write down with it.
--
-- The replacement also changes *how* the counters are kept, not just where. The
-- triggers were increments (+1/-1), which PostgREST cannot express at all — it has
-- no `set post_count = post_count + 1` — and increments are also the shape that
-- drifts: one lost update is wrong for good. So TypeScript recomputes instead. After
-- a write it counts the affected tags' rows in `post_tags` and the affected ratings'
-- rows in `posts`, and stores those numbers. That is exact rather than incremental,
-- so a sync that fails (logged, never fatal — the post write already succeeded) is
-- repaired by the next write touching the same tag or rating.
--
-- handle_new_user() stays: it fires on `auth.users`, a table the app never writes.

drop trigger if exists post_tags_count on public.post_tags;
drop trigger if exists posts_rating_count_ins on public.posts;
drop trigger if exists posts_rating_count_del on public.posts;
drop trigger if exists posts_rating_count_upd on public.posts;

drop function if exists public.tag_post_count_update();
drop function if exists public.rating_count_update();

-- Recomputing a rating is `count(*) from posts where rating = $1`, which on an
-- unindexed free-form text column is a sequential scan. The read path was already
-- paying that six times per render, which is why 20260828170000 built the counter
-- table; the write path should not inherit it. One partial-free btree turns each
-- recount into an index-only scan.
create index if not exists posts_rating_idx on public.posts (rating);

-- `post_tags (tag_id, post_id)` already exists (20260826100000), so the tag side of
-- the recount is index-only as it stands.

-- rating_counts keeps its select-only RLS. The triggers wrote it as `security definer`
-- precisely because no user session should choose these numbers, and that is still
-- true with the work in TypeScript: syncRatingCounts() runs on the service-role client
-- (src/lib/data/counters.ts), behind the `requireUser()` the post write already passed.
-- Adding an `authenticated` write policy here would hand every signed-in session a
-- PostgREST endpoint for setting the facet counts to whatever it likes, in exchange for
-- nothing.
--
-- tags.post_count needs no policy either way: `authenticated can update tags` has
-- existed since 20260828110000 for the category editor, and covers the column.
