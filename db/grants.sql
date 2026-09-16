-- Who may do what. Re-applied by `db:push` after every migration.
--
-- Separate from the schema because it is **desired state, not history**. It lived at the
-- bottom of the baseline for one afternoon, which was long enough to find the hole: a
-- migration runs once, so roles created afterwards — or dropped and recreated with new
-- passwords, which is exactly what console-made roles need — got nothing, and the runner
-- had no way to say so. Re-running it costs one statement and is idempotent.
--
-- What replaced RLS. Three logins, and the split is the point:
--
--   booru_owner  the migration runner's, and nothing else's. Never deployed, never
--                compiled into anything. Owns these tables.
--   booru_app    compiled into the desktop bundle. Reads and writes every row; may not
--                create, alter or drop anything. A Postgres login extracted from a
--                bundle is a database account rather than a revocable API key, so what
--                keeps a leaked build at "someone can vandalise the data" — unavoidable,
--                the app has to write — rather than "someone can drop the schema" is
--                that it owns nothing.
--   booru_web    held by Vercel. Reads everything, and writes exactly one column: the
--                view counter. Strictly stronger than what it replaced, where the site
--                carried a service-role key bypassing every policy in the project just
--                to count views.
--
-- The roles are created out of band, with passwords that do not belong in git — see
-- db/README.md. This block grants to whichever of them exist, so a database that has
-- none (a scratch branch, a fresh checkout) still migrates cleanly rather than failing
-- on a name it has never heard of.
--
-- **Create them with SQL, never in the Neon console.** A console-made role is granted
-- `neon_superuser` and comes with CREATEDB, CREATEROLE and BYPASSRLS, which overrides
-- every line below — `booru_web` reads as select-only here and can write anything. Worse,
-- the owner role cannot revoke that membership, so the only repair is to drop the role and
-- make it again from SQL.
do $$
declare
  app_tables constant text[] := array['tags', 'tag_rules',
                                      'tag_form_sections', 'tag_form_section_deps',
                                      'collections', 'collection_posts',
                                      'collection_tags', 'collection_post_tags'];
  entry text;
begin
  if to_regrole('booru_web') is not null then
    execute 'grant usage on schema public to booru_web';
    foreach entry in array app_tables loop
      execute format('grant select on public.%I to booru_web', entry);
    end loop;
    -- The website's only write: one column, the view counter on a collection image. A
    -- column grant rather than a policy, so the database refuses a stray update to anything
    -- else instead of the code remembering not to make one. It was three — `posts` and
    -- `generative_posts` had the same grant until both tables were dropped (0012).
    execute 'grant update (view_count) on public.collection_posts to booru_web';
    -- What the site is doing — the maintenance switch, and whatever setting comes after
    -- it. Read on every visit that isn't answered from the ten-minute hold, and read only:
    -- a setting is changed from the desktop app, which is the half of this project that
    -- writes.
    execute 'grant select on public.site_settings to booru_web';
  else
    raise notice 'booru_web does not exist — skipping its grants (see db/README.md)';
  end if;

  if to_regrole('booru_app') is not null then
    execute 'grant usage on schema public to booru_app';
    foreach entry in array app_tables loop
      execute format('grant select, insert, update, delete on public.%I to booru_app', entry);
    end loop;
    -- `site_settings` is not in that list because a setting is not a row of the board's
    -- content. Insert as well as update, since the table's whole point is that the next
    -- setting is a new key rather than a migration — but no delete: a key the code has
    -- stopped reading is harmless where a key the code still reads is a site that has
    -- forgotten what it was doing.
    execute 'grant select, insert, update on public.site_settings to booru_app';
    -- The artist list. Not in `app_tables` because that list is also `booru_web`'s, and the
    -- website has no business reading these: artists are the desktop app's alone, and the
    -- absence of a grant is what keeps that true rather than a page remembering it.
    foreach entry in array array['artists', 'artist_urls', 'artist_images'] loop
      execute format('grant select, insert, update, delete on public.%I to booru_app', entry);
    end loop;
  else
    raise notice 'booru_app does not exist — skipping its grants (see db/README.md)';
  end if;
end $$;
