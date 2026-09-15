-- A collection's own rating, and a mark drawn in front of its name.
--
-- **The rating is the shelf's, beside each image's.** An image's rating already keeps it
-- out of a listing with the NSFW setting off, but a shelf of adult work was still a card
-- with a name on it, and the name alone can say plenty. Rated `r`, the whole shelf is left
-- out: off the shelf list, its own page and every image page inside it behind the notice,
-- and out of the sitemap. It narrows and never lifts — an `r` image on a `g` shelf is still
-- hidden on its own rating. The same free-form letter as every other rating column, for the
-- reason the baseline gives, and `g` for every shelf made before this existed.
--
-- **The mark is text, not a tag's mark.** `tags.mark` is a colour or up to three emoji and
-- `markColor` decides which; a shelf's is a short prefix of anything — 🎴, `[WIP]`, `2024` —
-- drawn as itself. `readCollectionMark` in `@common/collections` settles the spelling. Null
-- for none, as on `tags`, so an empty box clears it.

alter table collections add column rating text not null default 'g';
alter table collections add column mark text;
