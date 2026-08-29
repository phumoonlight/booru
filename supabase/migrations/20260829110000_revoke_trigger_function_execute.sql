-- Take EXECUTE on the three trigger functions away from the API roles.
--
-- Postgres grants EXECUTE to PUBLIC on every new function, and PostgREST exposes
-- anything in the `public` schema, so `handle_new_user`, `tag_post_count_update` and
-- `rating_count_update` were all reachable as `POST /rest/v1/rpc/<name>` by an
-- anonymous visitor — as SECURITY DEFINER, i.e. running as the owner with RLS off.
-- Today each one aborts ("can only be called as a trigger"), so nothing was actually
-- exploitable; the point is that the definer bit plus a public grant is one edit away
-- from being exploitable, and the linter is right to refuse the combination.
--
-- Nothing breaks: a trigger's EXECUTE privilege is checked once, at CREATE TRIGGER
-- time, never when the trigger fires. The functions keep running for every insert on
-- auth.users, post_tags and posts exactly as before.
--
-- increment_post_view() deliberately keeps its grant — it is the one write an
-- anonymous visitor is meant to make (see 20260828130000).

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.tag_post_count_update() from public, anon, authenticated;
revoke execute on function public.rating_count_update() from public, anon, authenticated;
