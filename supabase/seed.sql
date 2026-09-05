-- Seed data. `[db.seed]` in config.toml points here, so this runs after the migrations
-- on `npm run db:reset` and `npm run db:reset:remote` — and on neither `db:push`, which
-- only applies migrations. A fresh board is otherwise completely empty.
--
-- Only the tag vocabulary belongs here. A post cannot be seeded: its row is half of a
-- pair, the other half being two files in storage named after the md5 of bytes this file
-- does not have, so a seeded post would be a row pointing at nothing.

-- `on conflict do nothing` because a reset is not the only thing that runs this, and a
-- name that already exists is the expected case rather than a failure. The category is
-- spelled out even though `general` is the column default — it is a property of the tag,
-- not of the insert, and the next line added here will want a different one.
insert into public.tags (name, category)
values ('school_uniform', 'general')
on conflict (name) do nothing;
