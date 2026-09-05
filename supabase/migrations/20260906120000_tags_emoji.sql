-- `tags.emoji` — up to three glyphs drawn in front of the tag's name.

-- It replaced a record in code (`TAG_EMOJI` in packages/common/src/tags.ts) keyed by tag
-- name, which could only ever be this repo holding a list about someone else's
-- vocabulary: a board coins a tag and the glyph for it is then a commit, a build and an
-- installer away from being seen. An emoji is a property of the tag the way its category
-- is, so it lives beside it and is edited on the Tags screen with everything else about
-- the row.
--
-- Nullable, and null is the common case. Most tags have no glyph that is unmistakably the
-- thing, and an approximate one is worse than none — it has to be decoded before the name
-- beside it is read. Nothing derives it from the name either: whether a compound tag reads
-- as its head word is a judgement per tag and not a rule, which is what put a bow on
-- `rainbow` when this was tried as a substring match.
--
-- Free-form text with no constraint, like `category` and `category2` above it. What may be
-- written is `readTagEmoji`'s business in @common/data/tags — three graphemes at most, and
-- none of them a plain ASCII character — and a row hand-edited to hold a word simply draws that word,
-- since this column reaches nothing but the front of a label.
alter table public.tags add column emoji text;
