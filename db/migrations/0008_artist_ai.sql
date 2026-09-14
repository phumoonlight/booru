-- Whether an artist's work is AI-generated.
--
-- A column rather than a second table, which is the opposite of the call the boards made,
-- and for the reason that call gives: `generative_posts` is a table because every listing,
-- walk, sitemap and counter would otherwise have had to remember a flag, and a forgotten one
-- put a generated image in the gallery. The artist list has one read, on one screen, which
-- splits the rows in TypeScript as it draws them — there is nothing to forget.
--
-- Not null, default false: every artist saved before this existed was saved as a person, and
-- the desktop screen opens on those.

alter table artists add column is_ai boolean not null default false;
