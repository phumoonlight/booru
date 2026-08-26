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

| column | type | notes |
|---|---|---|
| id | uuid PK | = `auth.users.id` |
| username | text unique not null | |
| role | text not null default 'member' | `'admin'` \| `'member'` |
| created_at | timestamptz default now() | |

### `posts`

| column | type | notes |
|---|---|---|
| id | bigint PK generated always as identity | booru-style numeric ids |
| uploader_id | uuid not null → profiles.id | admin for now; kept for future community uploads |
| md5 | text unique not null | dedup key; also the storage filename |
| file_ext | text not null | `jpg`/`png`/`gif`/`webp` |
| file_size | int not null | bytes |
| width / height | int not null | from sharp |
| rating | text not null default 'general' | `'general'` \| `'sensitive'` \| `'questionable'` \| `'explicit'` |
| source_url | text | original source |
| status | text not null default 'active' | `'active'` \| `'pending'` \| `'deleted'` — pending unused until community uploads |
| score | int not null default 0 | placeholder until voting exists |
| created_at | timestamptz default now() | |

Storage paths are derived, not stored: `originals/{md5}.{file_ext}`, `thumbnails/{md5}.webp`.

### `tags`

| column | type | notes |
|---|---|---|
| id | bigint PK identity | |
| name | text unique not null | lowercase, `snake_case`, validated `^[a-z0-9_().-]+$` |
| category | text not null default 'general' | `'general'` \| `'artist'` \| `'character'` \| `'copyright'` \| `'meta'` |
| post_count | int not null default 0 | denormalized; maintained by trigger on post_tags |
| created_at | timestamptz default now() | |

### `post_tags`

| column | type | notes |
|---|---|---|
| post_id | bigint → posts.id on delete cascade | |
| tag_id | bigint → tags.id | |
| PK | (post_id, tag_id) | |

Index both directions: PK covers `(post_id, tag_id)`; add index on `(tag_id, post_id)` for tag→posts lookups.

## Functions & triggers

### `handle_new_user()` trigger
On insert into `auth.users`, create a `profiles` row (username from email prefix,
role `'member'`). Promote the admin account manually once: `update profiles set role='admin' where id=...`.

### `tag_post_count` trigger
On insert/delete of `post_tags`, increment/decrement `tags.post_count`.

### `create_post_with_tags(...)` RPC
Transactional insert used by the upload action: inserts the post, upserts each tag
name (default category `general`), inserts `post_tags`. Security definer, but
**checks the caller is admin** internally (`profiles.role = 'admin'`) — do not rely
on the client only calling it from admin UI.

### `search_posts(include_tags text[], exclude_tags text[], p_rating text[], p_limit int, p_offset int)`
The core query. Returns posts (id, md5, file_ext, width, height, rating) where:

- post has **all** of `include_tags` — implemented as
  `group by post_id having count(distinct tag_id) = array_length(include_tags, 1)`
  over `post_tags` joined to `tags`
- post has **none** of `exclude_tags` (`not exists` subquery)
- `status = 'active'`, rating in `p_rating`
- ordered `id desc`, limit/offset

Also return `count(*) over()` (or a separate cheap count) for pagination UI.
This function is fine to ~100k posts; revisit (materialized tag arrays + GIN) only if it gets slow.

## Row Level Security

RLS **enabled on every table**. Policies for the current (admin-only moderation) era:

| table | select | insert | update | delete |
|---|---|---|---|---|
| profiles | public | trigger only | own row (username only) | — |
| posts | public where `status='active'`; admin sees all | admin | admin | admin |
| tags | public | admin (via RPC) | admin | admin |
| post_tags | public | admin (via RPC) | — | admin |

Helper: `is_admin()` — `exists(select 1 from profiles where id = auth.uid() and role = 'admin')`,
security definer, used inside policies.

When community moderation arrives ([future.md](./future.md)), only the posts/tags
policies change — no schema migration needed. Public accounts and `favorites` are
deferred too; see [future.md](./future.md) §3.

## Storage buckets

| bucket | public | policy |
|---|---|---|
| `originals` | yes (read) | write: admin only (or service role from the upload action) |
| `thumbnails` | yes (read) | write: admin only / service role |

## Deliberately NOT in v1 (see future.md)

comments, pools, notes, tag_aliases, tag_implications, post_votes, moderation_queue /
audit log, wiki pages.
