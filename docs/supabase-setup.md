# Supabase Setup Runbook

> **Read this once the code implementation is done.** Every step that needs a real
> Supabase cloud project lives here — nothing else in the docs asks you to touch a
> dashboard. Work top to bottom; each step says how to tell it worked.
>
> Until this runbook is run, the app builds and lints but talks to nothing: every page
> that reads the database shows a yellow "Supabase is not configured" notice instead
> of content.

## Step 1 — Create the project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Pick a name (e.g. `booru`), a strong database password (save it), and the region
   closest to you.
3. Wait for provisioning (~2 minutes).

## Step 2 — Fill `.env.local`

In the dashboard: **Project Settings → API**. Copy three values into `.env.local`
(create it from `.env.example` if it isn't there yet — it is git-ignored):

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
SUPABASE_SERVICE_ROLE_KEY=<service_role / secret key>
```

The service-role key bypasses RLS. It must never reach the browser — only
`src/lib/supabase/admin.ts` reads it, and that file is `server-only`.

**Verify:** `npm run dev`, open the home page. The yellow "Supabase is not configured"
notice should be gone, replaced by the (still empty) post grid. If the notice persists
the URL/key didn't load — restart the dev server after editing `.env.local`.

## Step 3 — Link the CLI and push migrations

`<project-ref>` is the subdomain in your project URL.

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

`db push` applies every file in `supabase/migrations/` in timestamp order:

| Migration | Contents |
|---|---|
| `20260826100000_initial_tables.sql` | `profiles`, `posts`, `tags`, `post_tags` + indexes |
| `20260826100100_functions_triggers.sql` | `is_admin()`, `handle_new_user`, `tag_post_count` |
| `20260826100200_rls_policies.sql` | RLS enabled + all policies |
| `20260826100300_storage_buckets.sql` | `originals` / `thumbnails` buckets + policies |
| `20260826110000_post_rpcs.sql` | `create_post_with_tags`, `update_post_with_tags` |

**Verify:** dashboard → **Table Editor** shows the four tables; **Storage** shows both
buckets; **Database → Functions** lists the five functions.

Never edit schema in the dashboard — write a new timestamped migration instead, so the
schema stays reproducible.

## Step 4 — Create and promote the admin account

Public signup doesn't exist until Phase 5, so create the account from the dashboard:

1. **Authentication → Users → Add user** → email + password, and tick
   *Auto Confirm User* (otherwise the login will fail on an unconfirmed email).
2. The `handle_new_user` trigger creates a matching `profiles` row automatically,
   with `role = 'member'` and username taken from the email prefix.
3. **SQL Editor**, promote it:

   ```sql
   update public.profiles set role = 'admin' where username = '<username>';
   ```

**Verify:** `select id, username, role from public.profiles;` returns one row with
`role = 'admin'`.

## Step 5 — Verify auth and the admin guard (finishes Phase 1)

With `npm run dev` running:

- Visit `/admin` while logged out → redirected to `/login`.
- Log in at `/login` with the admin account → redirected home; `/admin` now loads and
  shows "Log out (username)".
- Log out → `/admin` redirects to `/login` again.
- Optional non-admin check: create a second dashboard user, leave it `member`, log in
  as them, visit `/admin` → redirected to `/`.

RLS spot-check in the SQL editor (or via the dashboard's anon-role query runner):
anonymous `select` on `posts where status='active'` succeeds; anonymous `insert` into
`posts` fails with a policy violation.

## Step 6 — Verify the upload pipeline (finishes Phase 2)

Log in as admin, open `/admin/upload` in a phone-sized viewport (~375px), and upload a
real image with two or three tags.

Confirm all of the following:

- Success message with the new post id.
- **Storage → originals** contains `{md5}.{ext}`; **thumbnails** contains `{md5}.webp`
  and it is ≤400px on its longest side.
- `posts` has the row with correct `width`/`height`/`file_size`/`rating`.
- `tags` has one row per tag with `post_count = 1`; `post_tags` links them.
- Re-upload the same file → rejected with "This image already exists" plus a link to
  the existing post, and no duplicate storage objects.
- `/admin/posts` lists the post with its thumbnail; **Edit** changes tags/rating and
  the removed tag's `post_count` drops; **Delete** removes the row and both files.

Upload a handful more images before the next step — the browse UI needs real content.

## Step 7 — Verify browsing (finishes Phase 3)

Log out (or use a private window) so you are testing as an anonymous visitor, at ~375px:

- Home page shows the thumbnail grid, two columns, with a post count.
- Tapping a thumbnail opens `/posts/[id]`: image fits the width, tags are grouped and
  colour-coded by category, metadata is right, **Newer**/**Older** move between posts.
- Tapping a tag goes to `/?tags=<name>` and the grid narrows to that tag; **Clear
  filter** returns to everything.
- With more than 24 posts, the pagination row appears and page 2 loads a different set.
- Lighthouse mobile run on the home page passes.

## Step 8 — Mark the phases done

Tick the remaining `[ ]` items in [phases.md](./phases.md) for Phases 0–3 and flip
their rows to ✅ in [PLAN.md](./PLAN.md).

## Deferred to Phase 6

Production hardening — auth rate limits, storage size caps, PITR or scheduled dumps,
custom domain — is deliberately not here. It belongs to the Phase 6 deploy checklist.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Setup notice persists | `.env.local` not loaded — restart `npm run dev` |
| Images 404 or `next/image` errors on host | `.env.local` was added after the server started — `next.config.ts` reads the Supabase host at boot, so restart |
| `db push` says "no project linked" | Re-run `npx supabase link --project-ref <ref>` |
| Login fails with correct password | User not confirmed — tick Auto Confirm, or confirm from the dashboard |
| `/admin` bounces an admin to `/` | `profiles.role` is still `member`, or the session predates the promotion — log out and back in |
| Upload fails "admin only" | The RPC's internal `is_admin()` check failed — same cause as above |
| Upload fails at storage | Buckets missing — migration 4 didn't apply |
