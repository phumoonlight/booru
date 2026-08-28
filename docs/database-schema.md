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

### Post writes — `src/lib/data/posts.ts`

`createPostWithTags()` and `updatePostWithTags()` were the `create_post_with_tags` /
`update_post_with_tags` RPCs until `20260829100000`; they are now plain PostgREST calls
on the caller's session, so RLS (`auth.uid() is not null`) is the only guard and each
step's failure carries its own message. Both end in the same `setPostTags()`: upsert the
tag names that are new, delete the `post_tags` links that are no longer wanted, upsert
the ones that are — so `tags.post_count` keeps riding on its trigger.

There is no transaction across those requests any more. `createPostWithTags()` makes up
for it by deleting the post it just inserted if tagging fails, which cascades
`post_tags` and unwinds the count triggers.

### `increment_post_view(p_post_id bigint)` RPC

Adds 1 to `posts.view_count`. Security definer, because the update policy on `posts`
requires a signed-in user and anonymous visitors still count as views. Called from the
`recordPostView` server action only — never from a read path, so prefetches,
`generateMetadata` and crawlers don't inflate the number.

### Search — `src/lib/data/search.ts`

`searchPosts()` was the `search_posts` SQL function until `20260829100000`. It now
resolves tag membership to plain id lists first, then makes one PostgREST request that
only filters, orders and counts:

- **all** of the include tags — read the `post_tags` links for those tag ids (in pages,
  so nothing is silently truncated) and keep the posts whose distinct match count equals
  the number of tags asked for
- **none** of the exclude tags — the posts carrying any of them are subtracted from the
  candidate list, or filtered out with `not.in` when there are no include tags
- rating in the whitelist `resolveRatings()` produced, `order id desc`,
  `range(offset, offset + limit - 1)`, `count: 'exact'` for the pagination UI

The id lists are bounded by the tags' `post_count`, and plain browsing (no tags in the
query) skips them entirely — that path is a single indexed read. Fine to ~100k posts;
revisit (materialized tag arrays + GIN, or a function again) only if it gets slow.

## Row Level Security

RLS **enabled on every table**. Any signed-in user is a moderator:

| table         | select | insert              | update                  | delete       |
| ------------- | ------ | ------------------- | ----------------------- | ------------ |
| profiles      | public | trigger only        | own row (username only) | —            |
| posts         | public | signed-in           | signed-in               | signed-in    |
| tags          | public | signed-in          | signed-in               | signed-in    |
| post_tags     | public | signed-in          | —                       | signed-in    |
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
