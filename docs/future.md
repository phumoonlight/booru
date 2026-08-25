# Future Implementation (deferred by design)

Features intentionally **not** built now, plus the hooks already in the current design
that make them cheap to add later. Don't build anything here until the user asks.

## 1. Community moderation (currently: admin-only)

**Now:** only the admin uploads and moderates. Enforced by RLS (`is_admin()`) and
admin checks inside server actions.

**Hooks already in place:**
- `posts.status` includes `'pending'` (unused today) — community uploads land as
  `pending` instead of `active`.
- `posts.uploader_id` already records who uploaded.
- `profiles.role` is extensible (`'moderator'` later).

**When enabling:**
- Change RLS: authenticated users may insert posts with `status='pending'`; public
  select stays `status='active'`.
- Relax `create_post_with_tags` admin check to any authenticated user (forcing pending status).
- Add `/admin/queue`: approve (→ active) / reject (→ deleted) with reason.
- Add `moderation_log` table (who, action, post, reason, timestamp).
- Consider per-user upload limits and tag-edit permissions (Danbooru lets any user edit
  tags — that's a separate decision from upload rights).

## 2. Public API (currently: Server Actions only)

**Now:** all reads via RSC + `src/lib/data/`, all writes via Server Actions.

**Hook already in place:** query logic lives in `src/lib/data/`, not inside actions/pages,
so API route handlers can call the exact same functions.

**When enabling:**
- Add `src/app/api/v1/` route handlers: `GET /api/v1/posts?tags=...&page=`,
  `GET /api/v1/posts/[id]`, `GET /api/v1/tags?search=`.
- Follow the loose booru API conventions (JSON, `tags` query param) so existing booru
  client apps can point at the site with minimal changes.
- Rate limiting (Vercel/Upstash) before announcing it.
- API keys only if write endpoints are ever exposed; read-only can stay anonymous.

## 3. Other classic booru features (rough priority order)

| Feature | Notes / schema impact |
|---|---|
| Tag aliases | `tag_aliases(alias_name → tag_id)`; resolve at search + upload time |
| Tag implications | `tag_implications(tag_id → implied_tag_id)`; expand on upload |
| Post voting / score | `post_votes(user_id, post_id, vote)`; `posts.score` column already exists |
| Comments | `comments(post_id, user_id, body, created_at)` + moderation |
| Pools | `pools` + ordered `pool_posts(pool_id, post_id, position)` |
| Notes (translation overlays) | `notes(post_id, x, y, w, h, body)` — positioned boxes on the image |
| Wiki (tag descriptions) | `wiki_pages(tag_id, body)` |
| Parent/child posts (variants) | `posts.parent_id` self-reference |
| Saved searches / blacklists | per-user tag blacklist is the most requested QoL feature |
| Video/animation support | `posts.file_ext` already flexible; needs thumbnail-from-frame + `<video>` player |
