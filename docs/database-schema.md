# Database Schema

All schema lives in timestamped SQL migrations under `supabase/migrations/`.
This document is the design reference; the migrations are the source of truth once
Phase 1 starts. Update this doc if migrations diverge.

## Entity overview

```
profiles ───< posts >─── post_tags ───< tags
```

## Tables

### `profiles`

Mirrors `auth.users` (created by trigger when a user is added). Accounts are
created from the Supabase dashboard — public signup is deferred ([future.md](./future.md) §3).

| column     | type                      | notes             |
| ---------- | ------------------------- | ----------------- |
| id         | uuid PK                   | = `auth.users.id` |
| username   | text unique not null      |                   |
| created_at | timestamptz default now() |                   |

### `posts`

| column         | type                                   | notes                                                            |
| -------------- | -------------------------------------- | ---------------------------------------------------------------- |
| id             | bigint PK generated always as identity | booru-style numeric ids                                          |
| uploader_id    | uuid not null → profiles.id            | whoever uploaded the post                                        |
| md5            | text unique not null                   | dedup key; also the storage filename                             |
| file_ext       | text not null                          | `jpg`/`png`/`gif`/`webp`                                         |
| file_size      | int not null                           | bytes                                                            |
| width / height | int not null                           | from sharp                                                       |
| rating         | text not null default 'general'        | `'general'` \| `'sensitive'` \| `'questionable'` \| `'explicit'` |
| source_url     | text                                   | original source                                                  |
| view_count     | int not null default 0                 | bumped only by `increment_post_view()`, never by reading a post  |
| created_at     | timestamptz default now()              |                                                                  |

Storage paths are derived, not stored: `originals/{md5}.{file_ext}`, `thumbnails/{md5}.webp`.

### `tags`

| column     | type                            | notes                                                                   |
| ---------- | ------------------------------- | ----------------------------------------------------------------------- |
| id         | bigint PK identity              |                                                                         |
| name       | text unique not null            | lowercase, `snake_case`, validated `^[a-z0-9_().-]+$`                   |
| category   | text not null default 'general' | `'general'` \| `'artist'` \| `'character'` \| `'copyright'` \| `'meta'` |
| post_count | int not null default 0          | denormalized; maintained by trigger on post_tags                        |
| created_at | timestamptz default now()       |                                                                         |

### `rating_counts`

One counter row per rating, so the sidebar's rating facet is an O(1) read instead of a
`count(*)` per tier over `posts`. Same denormalization as `tags.post_count`.

| column     | type                   | notes                                                                 |
| ---------- | ---------------------- | --------------------------------------------------------------------- |
| rating     | text PK                | seeded with the full UI scale; a free-form value gets a row on demand |
| post_count | int not null default 0 | denormalized; maintained by trigger on posts                          |

### `post_tags`

| column  | type                                | notes |
| ------- | ----------------------------------- | ----- |
| post_id | bigint → posts.id on delete cascade |       |
| tag_id  | bigint → tags.id                    |       |
| PK      | (post_id, tag_id)                   |       |

Index both directions: PK covers `(post_id, tag_id)`; add index on `(tag_id, post_id)` for tag→posts lookups.

## Functions & triggers

### `handle_new_user()` trigger

On insert into `auth.users`, create a `profiles` row (username from email prefix).
There is no role column — every signed-in user may upload and manage posts.

### `tag_post_count` trigger

On insert/delete of `post_tags`, increment/decrement `tags.post_count`.

### `posts_rating_count` triggers

On insert/delete of `posts`, and on update **of `rating`** only (guarded by a `when`
clause so view_count bumps never fire it), increment/decrement the matching
`rating_counts` row.

### `create_post_with_tags(...)` RPC

Transactional insert used by the upload action: inserts the post, upserts each tag
name (default category `general`), inserts `post_tags`. Security definer, but
**checks the caller is signed in** internally (`auth.uid() is not null`) — do not
rely on the client only calling it from the upload UI.

### `increment_post_view(p_post_id bigint)` RPC

Adds 1 to `posts.view_count`. Security definer, because the update policy on `posts`
requires a signed-in user and anonymous visitors still count as views. Called from the
`recordPostView` server action only — never from a read path, so prefetches,
`generateMetadata` and crawlers don't inflate the number.

### `search_posts(include_tags text[], exclude_tags text[], p_rating text[], p_limit int, p_offset int)`

The core query. Returns posts (id, md5, file_ext, width, height, rating) where:

- post has **all** of `include_tags` — implemented as
  `group by post_id having count(distinct tag_id) = array_length(include_tags, 1)`
  over `post_tags` joined to `tags`
- post has **none** of `exclude_tags` (`not exists` subquery)
- rating in `p_rating`
- ordered `id desc`, limit/offset

Also return `count(*) over()` (or a separate cheap count) for pagination UI.
This function is fine to ~100k posts; revisit (materialized tag arrays + GIN) only if it gets slow.

## Row Level Security

RLS **enabled on every table**. Any signed-in user is a moderator:

| table         | select | insert              | update                  | delete       |
| ------------- | ------ | ------------------- | ----------------------- | ------------ |
| profiles      | public | trigger only        | own row (username only) | —            |
| posts         | public | signed-in           | signed-in               | signed-in    |
| tags          | public | signed-in (via RPC) | signed-in               | signed-in    |
| post_tags     | public | signed-in (via RPC) | —                       | signed-in    |
| rating_counts | public | trigger only        | trigger only            | trigger only |

The write test is `(select auth.uid()) is not null` inline in each policy; the old
`is_admin()` helper and `profiles.role` were dropped in
`20260828110000_drop_role_any_user_manages.sql`.

Public accounts and `favorites` are still deferred; see [future.md](./future.md) §3.

## Storage buckets

| bucket       | public     | policy                                                         |
| ------------ | ---------- | -------------------------------------------------------------- |
| `originals`  | yes (read) | write: signed-in only (or service role from the upload action) |
| `thumbnails` | yes (read) | write: signed-in only / service role                           |

## Deliberately NOT in v1 (see future.md)

comments, pools, notes, tag_aliases, tag_implications, post_votes, moderation_queue /
audit log, wiki pages.
