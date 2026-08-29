-- Drop the last SQL function that was query logic: increment_post_view().
--
-- 20260829100000 kept it on the grounds that PostgREST cannot express an in-place
-- increment without a read-modify-write race. That is still true, but the race is
-- containable from TypeScript: incrementPostView() in src/lib/data/posts.ts reads
-- view_count and writes back with `.eq('view_count', <what it read>)`, so a losing
-- writer matches no row and reads again instead of overwriting. Three attempts, then
-- the view is dropped.
--
-- What that buys is the reason the other functions left: the counter is now editable
-- without a migration, and its failures are ordinary PostgREST errors. It also ends
-- the last SECURITY DEFINER function anon could reach over /rest/v1/rpc — the action
-- runs the write with the service role instead, which never leaves the server.

drop function if exists public.increment_post_view(bigint);
