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
| rating         | text not null default 'general'        | `'general'` \| `'e1'` \| `'e2'` \| `'e3'` \| `'e4'` \| `'e5'` — free-form text, no check constraint |
| source_url     | text                                   | original source                                                  |
| view_count     | int not null default 0                 | bumped only by `incrementPostView()`, never by reading a post    |
| created_at     | timestamptz default now()              |                                                                  |

Storage paths are derived, not stored: `posts/{md5}.{file_ext}`, `post-thumbnails/{md5}.avif`.

### `tags`

| column     | type                            | notes                                                                   |
| ---------- | ------------------------------- | ----------------------------------------------------------------------- |
| id         | bigint PK identity              |                                                                         |
| name       | text unique not null            | lowercase, `snake_case`, validated `^[a-z0-9_().-]+$`                   |
| category   | text not null default 'general' | `'general'` \| `'artist'` \| `'character'` \| `'copyright'` \| `'meta'` |
| post_count | int not null default 0          | denormalized; recomputed by the write path (counters.ts)                 |
| created_at | timestamptz default now()       |                                                                         |

### `rating_counts`

One counter row per rating, so the sidebar's rating facet is an O(1) read instead of a
`count(*)` per tier over `posts`. Same denormalization as `tags.post_count`.

| column     | type                   | notes                                                                 |
| ---------- | ---------------------- | --------------------------------------------------------------------- |
| rating     | text PK                | seeded with the full UI scale; a free-form value gets a row on demand |
| post_count | int not null default 0 | denormalized; recomputed by the write path (counters.ts)              |

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

### Counters — `src/lib/data/counters.ts`

`tags.post_count` and `rating_counts.post_count` were kept by triggers (`tag_post_count`
on `post_tags`, three `posts_rating_count` triggers on `posts`) until they moved into TypeScript.
They are now recomputed in TypeScript, by `syncTagPostCounts()` / `syncRatingCounts()`,
which every write in `lib/data/posts.ts` calls with exactly the tags and ratings it moved.
They run on the service-role client, for the reason the triggers were `security definer`:
no user session should get to choose these numbers. `rating_counts` therefore still has
no write policy, and the authorization is the `requireUser()` the post write passed.

Recompute, not increment: PostgREST has no `set post_count = post_count + 1`, and the
read-then-write standing in for it can lose a concurrent update permanently. A recount —
`count(*)` over `post_tags` for a tag, over `posts` for a rating — is right regardless of
what it finds, so a stale write is repaired by the next one. `posts_rating_idx` makes the
rating side index-only; `post_tags (tag_id, post_id)` already covered the tag side.

Counter syncs log and never throw: by the time one runs the post write has succeeded, and
failing the upload afterwards would trade a wrong number for a lost image.

### Post writes — `src/lib/data/posts.ts`

`createPostWithTags()` and `updatePostWithTags()` were the `create_post_with_tags` /
`update_post_with_tags` RPCs early on; they are now plain PostgREST calls
on the caller's session, so RLS (`auth.uid() is not null`) is the only guard and each
step's failure carries its own message. Both end in the same `setPostTags()`: create the
tag names that are new, then diff the wanted set against the links already stored and
apply only the difference — which is also what it returns, so the caller knows exactly
which tags to recount.

There is no transaction across those requests any more. `createPostWithTags()` makes up
for it by deleting the post it just inserted if tagging fails. That delete goes through
`deletePostRow()`, shared with the delete action: it reads the post's tag links before
the row cascades them away, then recounts those tags and the rating it emptied.

### View counting — `incrementPostView()`

Was the `increment_post_view` RPC early on. PostgREST can't send
`view_count = view_count + 1`, so it reads the count and writes back with
`.eq('view_count', <what it read>)`: a concurrent view that landed first makes the
update match no row, and it reads again, up to three attempts. It runs on the service
role because the update policy on `posts` requires a signed-in user and an anonymous
visitor's view still counts.

Called from the `recordPostView` server action only — never from a read path, so
prefetches, `generateMetadata` and crawlers don't inflate the number.

### Search — `src/lib/data/search.ts`

`searchPosts()` was the `search_posts` SQL function early on. It now
resolves tag membership to plain id lists first, then makes one PostgREST request that
only filters, orders and counts:

- **all** of the include tags — read the `post_tags` links for those tag ids (in pages,
  so nothing is silently truncated) and keep the posts whose distinct match count equals
  the number of tags asked for
- **none** of the exclude tags — the posts carrying any of them are subtracted from the
  candidate list, or filtered out with `not.in` when there are no include tags
- rating in the whitelist `resolveRatings()` produced, `order id desc`, then
  `limit(perPage + 1)` — the spare row is how the feed knows there is more. Two
  cursors narrow it, both ids and neither an offset: `id <= from` starts the listing
  at a resumed bookmark, `id < after` continues it chunk to chunk. Nothing counts:
  `count: 'exact'` scanned the filtered set on every read, and the only thing that
  ever needed the total was a page number.

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
| rating_counts | public | service role only   | service role only       | —            |

The write test is `(select auth.uid()) is not null` inline in each policy; the old
`is_admin()` helper and `profiles.role` were dropped before the schema was squashed.

Public accounts and `favorites` are still deferred; see [future.md](./future.md) §3.

## Storage buckets

| bucket            | public     | policy                                                    |
| ----------------- | ---------- | --------------------------------------------------------- |
| `posts`           | yes (read) | write: signed-in only; the upload path uses service role   |
| `post-thumbnails` | yes (read) | write: signed-in only; the upload path uses service role   |

## Deliberately NOT in v1 (see future.md)

comments, pools, notes, tag_aliases, tag_implications, post_votes, moderation_queue /
audit log, wiki pages.
