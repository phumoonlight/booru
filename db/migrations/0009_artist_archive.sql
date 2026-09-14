-- Archived artists: kept for the record, off the reading list.
--
-- An artist who has stopped posting is still worth remembering — the links and examples are
-- the only note of who they were — but a row that can never be caught up on has no place in
-- a list ordered by how overdue each row is: it would sink to the top and stay there.
--
-- A date rather than a boolean, for the reason `read_at` is one: when an artist was archived
-- is shown on the archive list and orders it, and a flag beside a date would be a second
-- answer that could disagree. Null is on the reading list. `read_at` is left alone by an
-- archive, so unarchiving puts an artist back where their last read says they belong.

alter table artists add column archived_at timestamptz;
