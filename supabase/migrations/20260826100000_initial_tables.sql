-- Phase 1 / Migration 1: core tables + indexes
-- Reference: docs/database-schema.md

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

create table public.posts (
  id bigint generated always as identity primary key,
  uploader_id uuid not null references public.profiles (id),
  md5 text unique not null,
  file_ext text not null check (file_ext in ('jpg', 'png', 'gif', 'webp')),
  file_size integer not null,
  width integer not null,
  height integer not null,
  rating text not null default 'general'
    check (rating in ('general', 'sensitive', 'questionable', 'explicit')),
  source_url text,
  status text not null default 'active'
    check (status in ('active', 'pending', 'deleted')),
  score integer not null default 0,
  created_at timestamptz not null default now()
);

-- Browse queries filter on status and order by id desc
create index posts_status_id_idx on public.posts (status, id desc);
create index posts_uploader_id_idx on public.posts (uploader_id);

create table public.tags (
  id bigint generated always as identity primary key,
  name text unique not null check (name ~ '^[a-z0-9_().-]+$'),
  category text not null default 'general'
    check (category in ('general', 'artist', 'character', 'copyright', 'meta')),
  post_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- Autocomplete: prefix search ordered by popularity
create index tags_name_prefix_idx on public.tags (name text_pattern_ops);
create index tags_post_count_idx on public.tags (post_count desc);

create table public.post_tags (
  post_id bigint not null references public.posts (id) on delete cascade,
  tag_id bigint not null references public.tags (id),
  primary key (post_id, tag_id)
);

-- PK covers post→tags; this covers tag→posts
create index post_tags_tag_post_idx on public.post_tags (tag_id, post_id);
