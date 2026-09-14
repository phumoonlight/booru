-- Artists: a reading list of the people whose work is worth going back to.
--
-- **The desktop app's alone.** Nothing on the website draws an artist, and `db/grants.sql`
-- gives `booru_web` no grant on either table below — so "no display on the web" is the
-- database refusing a select rather than a page remembering not to make one, which is the
-- same bargain invariant 2 makes of writes.
--
-- **Separate from everything else on purpose.** An artist is not a tag (the board has an
-- `artist` category, and this does not point at it), not a board and not a collection. Its
-- example images are not posts: no rating, no source, no view count, no listing. They are
-- there to remind the person reading the list what that artist's work looks like.

create table artists (
  id integer generated always as identity primary key,
  -- A person's handle, as prose. `readArtistName` (`@common/artists`) settles the spelling.
  name text not null,
  -- When this artist was last caught up on, and the whole of the list's ordering: oldest
  -- first, so the artist most overdue a visit is the one at the top. Null is "never", which
  -- sorts above every date — a new artist is by definition one you have not caught up on.
  -- There is no read/unread flag beside it: whether you are behind is a question of how
  -- long ago, and a boolean would be a second answer to it that could disagree.
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Case-insensitive, as a collection's name is: `Hiten` and `hiten` are one artist typed
-- twice, and refusing the second is the useful answer.
create unique index artists_name_key on artists (lower(name));

-- The list's own order. `nulls first` matches `listArtists`, so the index serves the read.
create index artists_read_idx on artists (read_at asc nulls first, id asc);

create table artist_urls (
  id integer generated always as identity primary key,
  -- Cascade, unlike `collection_posts`: an address is a line of text somebody pasted, and
  -- keeping it after the artist it described is gone would be keeping nothing.
  artist_id integer not null references artists (id) on delete cascade,
  -- Normalized by `readArtistUrl` — http(s) only, through `URL`, so a host's case cannot
  -- make one address two rows.
  --
  -- `unique` across the whole table rather than per artist: one profile is one person, so
  -- pasting an address already saved is refused naming the artist who has it — which is
  -- how a duplicate artist under a second spelling gets noticed before it is made.
  url text unique not null,
  created_at timestamptz not null default now()
);

create index artist_urls_artist_idx on artist_urls (artist_id, id);

create table artist_images (
  id integer generated always as identity primary key,
  -- Cascade, and the stored objects are removed by `removeArtist` in TypeScript, which reads
  -- the names before the delete: they are examples of work that exists elsewhere, so an
  -- artist deleted is an artist whose examples are no longer wanted.
  artist_id integer not null references artists (id) on delete cascade,
  -- The md5 of the uploaded bytes, naming both stored objects:
  -- `artists/images/{file_name}.{file_ext}` and `artists/thumbs/{file_name}.avif`.
  -- Unique across the table for the reason `collection_posts.file_name` is: the prefix is
  -- flat, so two rows for one name would be two rows sharing one pair of objects, and
  -- deleting either would break the other.
  file_name text unique not null,
  file_ext text not null check (file_ext in ('jpg', 'png', 'gif', 'webp', 'avif')),
  file_size integer not null,
  width integer not null,
  height integer not null,
  created_at timestamptz not null default now()
);

create index artist_images_artist_idx on artist_images (artist_id, id);
