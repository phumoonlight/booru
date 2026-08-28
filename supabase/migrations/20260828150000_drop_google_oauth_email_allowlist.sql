-- Revert 20260828140000: Google-only sign-in was abandoned, so the allow-list that
-- gated it goes too. Dropping the trigger first matters — while it exists no
-- auth.users row can be created at all, dashboard invites included.

drop trigger if exists on_auth_user_allowlist on auth.users;
drop function if exists public.enforce_email_allowlist();
drop table if exists public.allowed_emails;
