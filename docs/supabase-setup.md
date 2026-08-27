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
| `20260826120000_search_posts.sql` | `search_posts` (multi-tag AND + negation) |

**Verify:** dashboard → **Table Editor** shows the four tables; **Storage** shows both
buckets; **Database → Functions** lists the six functions.

Never edit schema in the dashboard — write a new timestamped migration instead, so the
schema stays reproducible.

## Step 4 — Create and promote the admin account

Public signup is deferred ([future.md](./future.md) §3), so create the account from
the dashboard:

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

## Step 5 — Verify auth and the admin role (finishes Phase 1)

With `npm run dev` running:

- Log in at `/login` with the admin account → redirected home; the bottom nav now
  reads **Log out** and the posts page shows the **Upload** button.
- **Log out** → back to `/login`, and the Upload button is gone.
- Optional non-admin check: create a second dashboard user, leave it `member`, log in
  as them → no Upload button, and no Manage section on a post page.

RLS spot-check in the SQL editor (or via the dashboard's anon-role query runner):
anonymous `select` on `posts where status='active'` succeeds; anonymous `insert` into
`posts` fails with a policy violation.

## Step 6 — Verify the upload pipeline (finishes Phase 2)

Log in as admin, open `/` in a phone-sized viewport (~375px), and upload a real image
with the header's **Upload** button (or by dropping it on the page).

Confirm all of the following:

- Status panel shows the new post id, and the post is tagged `tagme`.
- **Storage → originals** contains `{md5}.{ext}`; **thumbnails** contains `{md5}.webp`
  and it is ≤400px on its longest side.
- `posts` has the row with correct `width`/`height`/`file_size`/`rating`.
- `tags` has one row per tag with `post_count = 1`; `post_tags` links them.
- Re-upload the same file → rejected with "This image already exists" plus a link to
  the existing post, and no duplicate storage objects.
- `/posts/[id]` shows the post; while signed in as admin its **Manage** section
  changes tags/rating (the removed tag's `post_count` drops); the trash icon arms a
  confirmation strip whose **Cancel** backs out and whose **Delete** removes the row
  and both files.

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

## Step 8 — Verify tag search (finishes Phase 4)

This is the one step with SQL that has never run against a real Postgres — the
`search_posts` function was written offline, so check it deliberately.

Upload (or tag) posts so that at least one carries `tag_a` and `tag_b`, one carries
`tag_a` only, and one carries all of `tag_a`, `tag_b`, `tag_c`. Then in the SQL editor:

```sql
-- Expect: only posts with BOTH tag_a and tag_b, and NOT tag_c
select id from public.search_posts(
  array['tag_a','tag_b'], array['tag_c'], null, 24, 0
);

-- Expect: every active post, and total_count equal to that number
select id, total_count from public.search_posts();
```

Then in the UI, at ~375px:

- Type into the search bar: suggestions appear after a short pause, ordered by post
  count, and are tappable with a thumb; arrow keys and Enter also select.
- Typing `-` before a tag still autocompletes and produces an exclusion chip.
- Searching `tag_a tag_b -tag_c` narrows the grid to the same set the SQL returned,
  and the URL reads `/?tags=tag_a+tag_b+-tag_c`.
- Tapping a chip's ✕ removes that tag and re-runs the search.
- The **Tags** button opens the bottom sheet listing the tags of the posts on screen;
  tapping one adds it to the search, the − excludes it. At `lg` width the same list is
  a left sidebar instead.
- `/tags` lists every tag by category, sorted by post count, each linking to a search.

## Step 9 — Mark the phases done

Tick the remaining `[ ]` items in [phases.md](./phases.md) for Phases 0–4 and flip
their rows to ✅ in [PLAN.md](./PLAN.md). Phase 5 finishes at step 13.

## Step 10 — Verify the rating filter (Phase 5)

Set at least one post to each rating from its **Manage** section, including one `e4`.
Then, signed out (private window):

- The home grid shows every post regardless of rating, and the total count includes them.
- The **Rating** facet (bottom sheet under `lg`, sidebar above) lists the ratings on
  screen; tapping one narrows the search to `/?tags=rating:<name>`, the − gives
  `-rating:<name>`, and tapping an active row clears it again.
- Opening the `e4` post directly by URL shows the image immediately — there is no gate.
- Its `<head>` still carries `<meta name="robots" content="noindex, follow">`, and
  `/sitemap.xml` does not list it: the adult tiers are kept out of search engines only.

Direct SQL check of the RPC's rating argument:

```sql
-- Expect: no explicit posts in the result
select id, rating from public.search_posts(
  '{}', '{}', array['general','sensitive','questionable'], 24, 0
);
```

## Step 11 — Deploy to Vercel (Phase 5)

The app is a stock Next.js project, so the defaults are right: framework Next.js,
build `next build`, install `npm install`, no root-directory override.

1. Push the repo to GitHub, then **vercel.com → Add New → Project → Import**.
2. Add the environment variables (**Project Settings → Environment Variables**),
   for Production *and* Preview:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | same as `.env.local` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same as `.env.local` |
   | `SUPABASE_SERVICE_ROLE_KEY` | same as `.env.local` — **not** prefixed `NEXT_PUBLIC_` |
   | `NEXT_PUBLIC_SITE_URL` | the final origin, e.g. `https://booru.example.com` |

   `NEXT_PUBLIC_SITE_URL` is what `src/lib/site.ts` turns into `metadataBase`,
   canonical links, `robots.txt` and `sitemap.xml`. Leave it unset on previews and
   Vercel's own deployment URL is used instead.
3. Deploy, then add the custom domain under **Project Settings → Domains** and point
   the DNS record Vercel shows you at it. Set `NEXT_PUBLIC_SITE_URL` to that domain
   and redeploy so the absolute URLs pick it up.
4. In Supabase: **Authentication → URL Configuration** → set **Site URL** to the same
   origin and add it (plus `https://*.vercel.app` for previews) to **Redirect URLs**,
   otherwise login bounces back to localhost.

**Verify** on the deployed origin:

- `https://<domain>/robots.txt` lists your domain in `Sitemap:`, and disallows
  `/login` and `?tags=` URLs.
- `https://<domain>/sitemap.xml` lists `/`, `/tags` and one entry per non-explicit
  active post.
- A post page's source contains `og:image` pointing at the Supabase thumbnail URL and
  a `<link rel="canonical">` on your domain — paste the URL into a link-preview
  debugger and the thumbnail renders.
- Log in on the deployed site and confirm an upload succeeds.
- Lighthouse mobile run on the home page passes.

## Step 12 — Production hardening (Phase 5)

In the Supabase dashboard:

- **Authentication → Providers → Email**: turn **Enable signup** *off*. There is no
  public signup by design (docs/future.md §3) — accounts are created by you.
- **Authentication → Rate limits**: lower the sign-in and token-refresh limits; the
  only human logging in is you.
- **Authentication → Sessions**: set a session timeout / refresh-token rotation.
- **Storage → Buckets → originals / thumbnails**: set a **file size limit** (e.g.
  20 MB) and restrict **allowed MIME types** to `image/jpeg, image/png, image/webp,
  image/gif`. The upload action validates the same things, but the bucket is the
  boundary that also covers the service-role path.
- **Settings → Database → Network restrictions**: leave Postgres closed to direct
  connections unless you need `psql` from a fixed IP.
- Rotate the service-role key if it was ever pasted anywhere shared, and confirm it
  exists only in `.env.local` and Vercel's env — never in git.

**Verify:** signup is refused from the dashboard's own "Invite" flow being the only
path in; uploading a file over the bucket limit fails at storage with a clear error
and no orphan row (the upload action rolls back).

## Step 13 — Backups (Phase 5)

Pick one:

- **Paid projects:** **Settings → Database → Point-in-time recovery** — enable it.
  This covers the database only.
- **Free projects:** schedule a dump. `npx supabase db dump --db-url "<connection
  string>" -f backup.sql` run from a cron job or a GitHub Action, committed nowhere
  public. Keep at least a week of dailies.

Storage objects are **not** in either backup. Mirror the buckets separately — e.g.
`npx supabase storage cp -r ss://originals ./backup/originals` on the same schedule.

**Verify:** restore one dump into a scratch Supabase project and confirm the four
tables and their row counts come back.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Setup notice persists | `.env.local` not loaded — restart `npm run dev` |
| Images 404 or `next/image` errors on host | `.env.local` was added after the server started — `next.config.ts` reads the Supabase host at boot, so restart |
| `db push` says "no project linked" | Re-run `npx supabase link --project-ref <ref>` |
| Login fails with correct password | User not confirmed — tick Auto Confirm, or confirm from the dashboard |
| No Upload button after logging in | `profiles.role` is still `member`, or the session predates the promotion — log out and back in |
| Upload fails "admin only" | The RPC's internal `is_admin()` check failed — same cause as above |
| Upload fails at storage | Buckets missing — migration 4 didn't apply |
