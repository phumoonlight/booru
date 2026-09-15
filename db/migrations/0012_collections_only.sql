-- The two boards are gone; collections are the site.
--
-- Every post and every AI post was moved onto a shelf, so the tables they lived in hold
-- nothing anybody reads. Dropped here, with the link tables that joined them to `tags` and
-- the two count columns those link tables fed. **The tag vocabulary itself stays** — `tags`,
-- `tag_rules`, `tag_form_sections` and `tag_form_section_deps` — kept for a later use rather
-- than thrown away with the posts that happened to be its only reader so far.
--
-- The stored objects under `posts/`, `thumbs/`, `generative/posts/` and `generative/thumbs/`
-- are not touched by this file and cannot be: a migration reaches the database, not the
-- bucket. They are orphans after this runs.
--
-- Link tables first, since both reference their post table.

drop table post_tags;
drop table generative_post_tags;
drop table posts;
drop table generative_posts;

-- `tags_post_count_idx` goes with its column.
alter table tags drop column post_count;
alter table tags drop column generative_post_count;

-- What the AI board was for, as a fact about a shelf: a collection of generated images.
-- A boolean rather than a second table, because the split that made `generative_posts` a
-- table was about tag counts and listings that had to be impossible to mix — and a shelf
-- has neither. The website filters on it; nothing else reads it. Every shelf made before
-- this existed is not an AI one.
alter table collections add column is_ai boolean not null default false;

-- An image's tier is its shelf's now (`collections.rating`, 0011). Dropped as it stands,
-- without raising any shelf first: whatever each shelf is rated when this runs is what its
-- images are rated from here on.
alter table collection_posts drop column rating;
