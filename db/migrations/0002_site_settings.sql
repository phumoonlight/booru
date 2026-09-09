-- ── site_settings ─────────────────────────────────────────────────────────────
-- What the *website* is doing, as opposed to what is on it.
--
-- Everything else in this schema is a fact about the board's content — a post, a tag, a
-- rule about a tag. This is a fact about the deployment: right now, whether the site is
-- serving the gallery or a notice saying it is closed. It has to be a table rather than an
-- environment variable because the desktop app is what changes it, and the desktop app can
-- reach the database and cannot reach Vercel's settings — a variable would mean a redeploy
-- to close the site and another to open it.
--
-- **A name and a string, not a column per setting and not JSON.** A column per setting
-- needs a migration for every switch anybody ever wants, and a site-wide switch is exactly
-- what gets wanted at the moment there is no time to write one. JSON would buy structure
-- that nothing here needs and cost the one property this table is meant to have: a row is
-- readable and editable by hand, in a console, by the person who owns the board. So a
-- setting is one row holding one value, and a setting with two parts is two rows.
--
-- What that costs is that the database no longer checks a setting's shape. It never did:
-- the columns this replaces were a boolean and free text. The check that matters is on the
-- one path that writes, and `@common/data/site.ts` reads every value defensively — a row
-- that is missing, misspelled or hand-edited into nonsense costs a default and never a
-- throw, which is the only way a settings table may fail on a page that has to render.
create table site_settings (
  -- The setting's name. The two below are the only ones so far; the point of the table is
  -- that the next one is an insert rather than a migration.
  key text primary key,

  -- Its value, as text, because that is what a person types into a console. What the
  -- string means belongs to the code that reads it — `maintenance` is 'on' or 'off',
  -- read loosely and written strictly, the same bargain `asRating` makes for ratings.
  value text not null default '',

  -- When this setting was last decided. The maintenance notice shows the later of its two
  -- rows, which is the one thing a visitor can use — "since 14:02" answers "is anyone doing
  -- anything about this" better than any wording. Written by the app on every save rather
  -- than by a trigger; there are no triggers here.
  updated_at timestamptz not null default now()
);

-- The two rows the website reads today, seeded so a fresh board comes up serving. A key
-- the table has not got is not an error either — the reader answers with the default — so
-- this is a convenience rather than a requirement, and the same is true of a key added by
-- hand later.
insert into site_settings (key, value) values
  -- 'on' closes the site. Anything else, this included, leaves it serving.
  ('maintenance', 'off'),
  -- Shown under the notice's own heading, so it is for what a visitor cannot work out —
  -- how long, mainly. Empty is the ordinary state.
  ('maintenance_message', '');
