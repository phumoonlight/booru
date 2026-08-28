-- Passwordless sign-in: Google OAuth only, restricted to an email allow-list.
--
-- Every signed-in user may upload, edit and delete any post (see
-- 20260828110000_drop_role_any_user_manages.sql). Password login kept that safe by
-- keeping account creation in the owner's hands; "sign in with Google" is open to
-- anyone on the internet, so the gate moves here. A BEFORE INSERT trigger on
-- auth.users rejects an address that is not listed, which aborts the whole sign-up:
-- no auth user, no session, and no profiles row.

create table public.allowed_emails (
  email text primary key check (email = lower(email)),
  note text,
  created_at timestamptz not null default now()
);

-- The list of who may sign in is not public. RLS on with no policies at all means
-- anon and authenticated see nothing; maintain it from the SQL editor, which runs
-- as the service role and bypasses RLS.
alter table public.allowed_emails enable row level security;

create or replace function public.enforce_email_allowlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.allowed_emails where email = lower(new.email)
  ) then
    raise exception 'email % is not on the sign-in allow list', new.email
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- BEFORE, so the raise pre-empts the AFTER trigger that writes the profiles row.
-- Existing users are unaffected: this fires on sign-up, not on sign-in.
create trigger on_auth_user_allowlist
  before insert on auth.users
  for each row execute function public.enforce_email_allowlist();
