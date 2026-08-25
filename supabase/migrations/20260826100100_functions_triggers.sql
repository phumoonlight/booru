-- Phase 1 / Migration 2: is_admin() helper, handle_new_user trigger, tag_post_count trigger

-- Used inside RLS policies; security definer so it can read profiles regardless of caller
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Create a profiles row for every new auth user (username = email prefix, de-duped)
create or replace function public.handle_new_user()
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

-- Keep tags.post_count in sync with post_tags
create or replace function public.tag_post_count_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.tags set post_count = post_count + 1 where id = new.tag_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.tags set post_count = post_count - 1 where id = old.tag_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger post_tags_count
  after insert or delete on public.post_tags
  for each row execute function public.tag_post_count_update();
