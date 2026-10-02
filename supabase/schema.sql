-- Prerequisite for scripts/migrate-to-supabase.js — run this once in the
-- Supabase SQL editor before running the script.
--
-- This is deliberately minimal: just the two tables the migration script
-- copies into (profiles, catches). It has no RLS policies, no auth wiring and
-- no scoring trigger yet — those belong to the separate app rewrite, not this
-- one-time data migration.
--
-- legacy_id columns map a row back to its old SQLite integer id. They exist
-- only so the migration script can upsert on them and be safe to re-run
-- without creating duplicates; the app itself never reads them.

create extension if not exists citext;

create table if not exists profiles (
  id          uuid primary key default gen_random_uuid(),
  username    citext not null unique,
  legacy_id   integer unique,
  created_at  timestamptz not null default now()
);

create table if not exists catches (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references profiles(id) on delete cascade,
  species     text not null,
  weight_lbs  numeric not null,
  length_in   numeric not null,
  caught_at   timestamptz not null,
  location    text,
  photo_url   text,
  legacy_id   integer unique,
  created_at  timestamptz not null default now()
);

create index if not exists idx_catches_user on catches (user_id, id desc);

-- Storage bucket for photos. Public read so the feed/profile pages can
-- display them; writes are left open here since this schema has no auth
-- wiring yet (the migration script writes with the service role key, which
-- bypasses storage policies entirely).
insert into storage.buckets (id, name, public)
values ('catch-photos', 'catch-photos', true)
on conflict (id) do nothing;
