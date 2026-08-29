-- `profiles` — one row per auth user, created by a trigger on sign-up.
--
-- First of the five table migrations. Together with 20260826090000_storage_buckets.sql
-- they replace the 18 incremental migrations written while the app was being built;
-- most of that history was features added and then taken back out (an admin/member role
-- split, a Google-OAuth allow-list, moderation columns, the search and post-write RPCs),
-- and only the end state is here. The rest is in git and docs/PLAN.md.
--
-- Do not let an editor reformat this file. A SQL formatter rewrites the `$$` around the
-- plpgsql body below as `$ $`, which is a syntax error — .vscode/settings.json turns
-- format-on-save off for `.sql` for exactly that reason.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  created_at timestamptz not null default now()
);

-- No role tier: any signed-in account may upload, edit and delete any post.
-- Public signup would need a privilege tier first (docs/future.md §1).

-- Create a profiles row for every new auth user (username = email prefix, de-duped).
-- The only SQL function in the schema: it fires on auth.users, a table the app never
-- writes. Everything else that was once plpgsql now lives in src/lib/data/.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  candidate text;
begin
  base := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_.-]', '_', 'g'));
  if base is null or base = '' then
    base := 'user';
  end if;
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    candidate := base || '_' || substr(md5(random()::text), 1, 4);
  end loop;
  insert into public.profiles (id, username) values (new.id, candidate);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Postgres grants EXECUTE to PUBLIC on every new function and PostgREST exposes the
-- `public` schema, so without this a security-definer function is reachable as
-- POST /rest/v1/rpc/handle_new_user by an anonymous visitor. A trigger's EXECUTE
-- privilege is checked at CREATE TRIGGER time, never when it fires, so the trigger
-- above keeps working.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- RLS: public read; users may update only their own row. Inserts happen via the
-- security-definer trigger above, which bypasses RLS, so there is no insert policy.
alter table public.profiles enable row level security;

create policy "profiles are publicly readable"
  on public.profiles for select
  using (true);

create policy "users can update own profile"
  on public.profiles for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Column-level guard: username is the only user-updatable column
revoke update on public.profiles from anon, authenticated;
grant update (username) on public.profiles to authenticated;
