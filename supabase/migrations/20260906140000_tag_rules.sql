-- `tag_rules` — the two answers to "this tag is on the post, what else should be?".
--
-- Both used to be sections of the desktop app's `save.json`, `{ tag: [name, …] }` keyed
-- by name, which cost three things a table does not. A rule naming a tag that was later
-- renamed went dead and stayed dead, silently. A rule naming a tag that was deleted did
-- the same. And the rules were one machine's: a second install, or a reinstall after
-- losing the file, started with none.
--
-- Rows here are tag *ids*, so a rename carries every rule that names it and a delete
-- takes them with it. That is only safe because no write path coins a tag any more
-- (`resolveTagIds` in @common/data/shared) — a rule can only ever name a tag the board
-- has, which is what the Tags screen's picker was already enforcing by hand.

create table public.tag_rules (
  tag_id bigint not null,
  -- One table, not two. The two rule sets differ in what the app does with a row —
  -- an implication is applied by itself, a recommendation is offered as a chip — and
  -- not at all in its shape, so two tables would be the same columns, the same
  -- policy and the same read written twice for the sake of a discriminator that is
  -- one column.
  --
  -- **0 is `implies`, 1 is `recommends`.** A number rather than the word, which is
  -- the one thing here a reader of the table cannot work out from the table: a row
  -- says `0` and means "applied by itself". `RULE_KIND` in @common/data/rules.ts is
  -- the mapping, and it is the only place either number is written — everything
  -- above it, the IPC channels included, says `'implies'` or `'recommends'`.
  kind smallint not null check (kind in (0, 1)),
  -- The tag the rule names. `target` rather than `implied` because one column serves
  -- both kinds and only one of them implies anything — on a `kind = 1` row this is a
  -- tag that gets offered, not one that gets added.
  target_tag_id bigint not null,

  -- The primary key is the whole row's meaning: a rule is a (trigger, kind, target)
  -- edge, and saying it twice is saying it once. It also orders `tag_id, kind` first,
  -- which is how one tag's panel reads its own rules.
  --
  -- No `created_at`. Every other table has one because something asks: a post's is its
  -- order in the gallery, a tag's is how long it has been in the vocabulary. Nothing
  -- asks when a rule was written — the whole set is read at once and drawn in tag
  -- order — and a column nobody reads is one more thing to keep true.
  primary key (tag_id, kind, target_tag_id),

  -- A tag implying or recommending itself is the one rule that can never do anything.
  -- It was dropped in `normalizeRules` on the way in; here it cannot be stored at all.
  constraint tag_rules_not_self check (tag_id <> target_tag_id),

  -- Named rather than left to Postgres, because both point at the same table and
  -- PostgREST needs the constraint name to tell the two embeds apart — the read in
  -- @common/data/rules.ts asks for `tags!tag_rules_tag_id_fkey(name)` by this exact
  -- spelling.
  constraint tag_rules_tag_id_fkey foreign key (tag_id)
    references public.tags (id) on delete cascade,
  constraint tag_rules_target_tag_id_fkey foreign key (target_tag_id)
    references public.tags (id) on delete cascade
);

-- No index on `target_tag_id`. The only thing that reads that way is the cascade when a
-- tag is deleted, which is rare and scans a table of a few hundred rows; the whole set is
-- read at once into the app's rule store either way, and "what implies this tag?" is
-- answered there, in memory. The same reasoning as the deliberate absence of a third
-- index on `tags`.

-- RLS: public read, and no write policy — see the note in 20260826100100_posts.sql. The
-- desktop app writes these on the service role. The website has no use for them yet: a
-- rule fires where a post is tagged, and that only happens in the app.
alter table public.tag_rules enable row level security;

create policy "tag rules are publicly readable"
  on public.tag_rules for select
  using (true);

-- An implied *rating* — `panties` meaning a post is at least Questionable — used to ride
-- in the same list as the implied tags, spelled `rating:questionable`, because a JSON
-- file is one list per tag and that is the board's own grammar for a rating among tags.
-- It cannot be a row above: the thing implied is not a tag.
--
-- It is a column here rather than a nullable second column on `tag_rules` because a tag
-- has at most one. `normalizeRules` already collapsed a list to its highest token — a
-- floor of General under a floor of Explicit is not a second rule, it is the same one
-- written twice — so one value per tag is exactly what was being stored, and the
-- alternative is two mutually-exclusive nullable columns and a partial unique index
-- underneath them.
--
-- Free-form text like `posts.rating`, and holding what that column holds: the letter, not
-- the `rating:explicit` token a query spells. `storedRating` in @common/data/rules.ts is
-- what reads it — `asRating` is for tokens and returns null for a bare `e` — and an
-- unreadable value is no floor rather than a crash.
alter table public.tags add column implied_rating text;

comment on column public.tags.implied_rating is
  'A floor, not a setting: a post carrying this tag is raised to at least this rating and never lowered to it.';
