-- Favourite artists: a second reading list, kept apart from the first.
--
-- The favourites are read the same way as everyone else — never-read first, then the longest
-- since caught up on, marked read with the same hold — and are drawn on a tab of their own so
-- the few artists never to fall behind on are not buried among the many worth a look.
--
-- A boolean rather than a date, unlike `archived_at`: nothing is ordered or shown by when an
-- artist was made a favourite, since the tab is ordered by `read_at` like the reading list.
-- Independent of `archived_at`, which wins while it is set — an archived favourite is in the
-- archive, and unarchiving puts it back on the favourites rather than the reading list.
--
-- Not null, default false: every artist saved before this existed is on the reading list.

alter table artists add column is_favorite boolean not null default false;
