-- Catch N' Score — full Supabase schema.
-- Run this in the Supabase SQL editor. Safe to re-run: tables/indexes use
-- IF NOT EXISTS, views/functions use CREATE OR REPLACE, and policies/triggers
-- are dropped and recreated.
--
-- Identity: real Supabase Auth accounts (email + password). profiles.id
-- equals auth.users.id for every real account, set by the handle_new_user
-- trigger at sign-up — there is deliberately NO foreign key from profiles.id
-- to auth.users.id, because the 2 rows migrated from the old SQLite backup
-- have no matching auth account yet (see the legacy-reattachment note on
-- handle_new_user below) and that FK would reject them outright.
--
-- Scoring is still computed by a trigger, never trusted from the client.
--
-- legacy_id columns map a row back to its old SQLite integer id, for
-- scripts/migrate-to-supabase.js's upsert-based idempotency. The app itself
-- never reads them. To grant your own account admin, see
-- supabase/grant-admin.sql — run it by hand, it's not part of this file.

create extension if not exists citext;
create extension if not exists pgcrypto;

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists profiles (
  id          uuid primary key default gen_random_uuid(),
  username    citext not null unique check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  is_admin    boolean not null default false,
  legacy_id   integer unique,
  created_at  timestamptz not null default now()
);

-- CREATE TABLE IF NOT EXISTS above is a no-op against a profiles table that
-- already existed (e.g. from before is_admin existed) — these retrofit it.
alter table profiles add column if not exists is_admin boolean not null default false;

do $$ begin
  alter table profiles add constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,20}$');
exception when duplicate_object then null;
end $$;

-- Game rules — mirrors server/src/config.js's SPECIES + BASE_POINTS.
create table if not exists species (
  name            text primary key,
  rarity          text not null check (rarity in ('common', 'uncommon', 'rare', 'trophy')),
  typical_weight  numeric not null,
  typical_length  numeric not null,
  base_points     integer not null
);

insert into species (name, rarity, typical_weight, typical_length, base_points) values
  ('Bluegill', 'common', 0.5, 7, 10),
  ('Green Sunfish', 'common', 0.3, 6, 10),
  ('Pumpkinseed', 'common', 0.3, 6, 10),
  ('Rock Bass', 'common', 0.5, 7, 10),
  ('Yellow Perch', 'common', 0.6, 9, 10),
  ('Black Crappie', 'common', 0.8, 10, 10),
  ('White Crappie', 'common', 0.8, 10, 10),
  ('Common Carp', 'common', 8, 24, 10),
  ('Largemouth Bass', 'uncommon', 2.5, 15, 25),
  ('Smallmouth Bass', 'uncommon', 2, 15, 25),
  ('Spotted Bass', 'uncommon', 1.5, 14, 25),
  ('White Bass', 'uncommon', 1, 12, 25),
  ('Channel Catfish', 'uncommon', 4, 22, 25),
  ('Rainbow Trout', 'uncommon', 2, 16, 25),
  ('Brook Trout', 'uncommon', 1, 12, 25),
  ('Brown Trout', 'uncommon', 2.5, 17, 25),
  ('Redfish', 'uncommon', 6, 26, 25),
  ('Speckled Trout', 'uncommon', 2, 17, 25),
  ('Flounder', 'uncommon', 2, 16, 25),
  ('Walleye', 'rare', 3, 20, 50),
  ('Northern Pike', 'rare', 5, 28, 50),
  ('Striped Bass', 'rare', 10, 30, 50),
  ('Blue Catfish', 'rare', 15, 32, 50),
  ('Flathead Catfish', 'rare', 15, 32, 50),
  ('Lake Trout', 'rare', 8, 26, 50),
  ('Coho Salmon', 'rare', 8, 26, 50),
  ('Snook', 'rare', 8, 28, 50),
  ('Chinook Salmon', 'trophy', 20, 36, 100),
  ('Muskellunge', 'trophy', 15, 40, 100),
  ('Sturgeon', 'trophy', 40, 55, 100),
  ('Tarpon', 'trophy', 60, 60, 100),
  ('Other', 'common', 2, 12, 10)
on conflict (name) do update set
  rarity = excluded.rarity, typical_weight = excluded.typical_weight,
  typical_length = excluded.typical_length, base_points = excluded.base_points;

create table if not exists catches (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references profiles (id) on delete cascade on update cascade,
  species     text not null references species (name),
  weight_lbs  numeric not null check (weight_lbs > 0),
  length_in   numeric not null check (length_in > 0),
  caught_at   timestamptz not null,
  location    text check (location is null or char_length(location) <= 100),
  photo_url   text,
  legacy_id   integer unique,
  created_at  timestamptz not null default now()
);

-- Same retrofit problem for a catches table that already existed: the
-- species FK, the three CHECK constraints, and ON UPDATE CASCADE on user_id
-- (needed for legacy profile reattachment at sign-up, see handle_new_user)
-- are all no-ops above against a pre-existing table.
do $$ begin
  alter table catches add constraint catches_species_fkey foreign key (species) references species (name);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table catches add constraint catches_weight_lbs_check check (weight_lbs > 0);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table catches add constraint catches_length_in_check check (length_in > 0);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table catches add constraint catches_location_check check (location is null or char_length(location) <= 100);
exception when duplicate_object then null;
end $$;

-- Replace whatever the user_id foreign key is currently named (found
-- dynamically, rather than assumed) with one that has ON UPDATE CASCADE.
do $$
declare
  fk_name text;
begin
  select tc.constraint_name into fk_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
  where tc.table_name = 'catches' and tc.constraint_type = 'FOREIGN KEY' and kcu.column_name = 'user_id'
  limit 1;
  if fk_name is not null then
    execute format('alter table catches drop constraint %I', fk_name);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catches_user_id_fkey') then
    alter table catches add constraint catches_user_id_fkey
      foreign key (user_id) references profiles (id) on delete cascade on update cascade;
  end if;
end $$;

create table if not exists scores (
  catch_id      bigint primary key references catches (id) on delete cascade,
  user_id       uuid not null references profiles (id) on delete cascade on update cascade,
  points        integer not null,
  base          integer not null,
  weight_bonus  integer not null,
  length_bonus  integer not null,
  earned_at     timestamptz not null
);

create index if not exists idx_catches_user on catches (user_id, id desc);
create index if not exists idx_scores_user on scores (user_id);
create index if not exists idx_scores_earned on scores (earned_at);

-- ── Sign-up: create/re-key the profile for a new auth account ──────────────
-- Username and format/uniqueness are validated here (not left to the raw
-- unique-constraint error) so sign-up gets a readable message instead of a
-- generic "Database error saving new user".
--
-- Legacy reattachment: the 2 profiles migrated from the old SQLite backup
-- have no auth.users row behind them. If this username matches one of them,
-- this re-keys that profile's id to the new account instead of inserting a
-- fresh row — catches/scores carry ON UPDATE CASCADE, so their history moves
-- with it. This is pure username-matching with no further proof of identity;
-- see the caveat in the migration plan this shipped with.

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  requested citext := trim(NEW.raw_user_meta_data ->> 'username');
  legacy_row profiles%rowtype;
begin
  if requested is null or requested = '' then
    raise exception 'Username is required';
  end if;
  if requested !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'Username must be 3–20 letters, numbers or underscores';
  end if;

  select * into legacy_row from profiles p
    where p.username = requested
      and not exists (select 1 from auth.users u where u.id = p.id);
  if legacy_row.id is not null then
    update profiles set id = NEW.id where id = legacy_row.id;
  else
    if exists (select 1 from profiles where username = requested) then
      raise exception 'That username is taken';
    end if;
    insert into profiles (id, username) values (NEW.id, requested);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user after insert on auth.users
  for each row execute function handle_new_user();

-- Resolves a username to its account's email for login — returns only that,
-- nothing else, and is callable while signed out (login needs it before
-- there's a session). This does mean a logged-out caller can confirm a
-- username exists and learn its email, the same exposure any "log in with
-- username" feature has.
create or replace function email_for_login(p_identifier citext)
returns text
language sql security definer set search_path = public as $$
  select u.email from profiles p join auth.users u on u.id = p.id where p.username = p_identifier;
$$;

grant execute on function email_for_login(citext) to anon, authenticated;

-- is_admin can never be changed through a client request, even if a future
-- policy allows users to update other profile columns. PostgREST always sets
-- the request.jwt.claims GUC (even for the anon role, and even for a
-- service-role API call) when it proxies a request; a direct SQL editor/psql
-- connection never sets it at all. That's what distinguishes "came through
-- the API" from "run by hand", which is the only path grant-admin.sql uses.
create or replace function profiles_protect_is_admin() returns trigger
language plpgsql as $$
begin
  if NEW.is_admin is distinct from OLD.is_admin and current_setting('request.jwt.claims', true) is not null then
    NEW.is_admin := OLD.is_admin;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_profiles_protect_is_admin on profiles;
create trigger trg_profiles_protect_is_admin before update on profiles
  for each row execute function profiles_protect_is_admin();

-- ── Scoring (ported from server/src/lib/scoring.js) ─────────────────────────
-- WEIGHT_FACTOR 0.75, LENGTH_FACTOR 0.5, RATIO_CAP 4, MAX_PLAUSIBLE_RATIO 10.

create or replace function compute_score(p_species text, p_weight numeric, p_length numeric)
returns table (total int, base int, weight_bonus int, length_bonus int)
language plpgsql stable as $$
declare
  sp species%rowtype;
  weight_ratio numeric;
  length_ratio numeric;
  wb int;
  lb int;
begin
  select * into sp from species where name = p_species;
  if sp is null then
    raise exception 'Unknown species';
  end if;
  weight_ratio := least(p_weight / sp.typical_weight, 4);
  length_ratio := least(p_length / sp.typical_length, 4);
  wb := round(sp.base_points * 0.75 * weight_ratio);
  lb := round(sp.base_points * 0.5 * length_ratio);
  return query select (sp.base_points + wb + lb)::int, sp.base_points, wb, lb;
end;
$$;

-- Read-only preview for the log-catch form's live estimate — same messages
-- as the old checkMeasurements(), same math as compute_score() above, so the
-- preview and the real score can never drift apart.
create or replace function preview_score(p_species text, p_weight numeric, p_length numeric)
returns table (total int, base int, weight_bonus int, length_bonus int)
language plpgsql stable as $$
declare
  sp species%rowtype;
begin
  select * into sp from species where name = p_species;
  if sp is null then
    raise exception 'Unknown species';
  end if;
  if p_weight is null or p_weight <= 0 then
    raise exception 'Weight must be a positive number';
  end if;
  if p_length is null or p_length <= 0 then
    raise exception 'Length must be a positive number';
  end if;
  if p_weight > sp.typical_weight * 10 then
    raise exception 'That weight looks too high for a %', sp.name;
  end if;
  if p_length > sp.typical_length * 10 then
    raise exception 'That length looks too long for a %', sp.name;
  end if;
  return query select * from compute_score(p_species, p_weight, p_length);
end;
$$;

grant execute on function preview_score(text, numeric, numeric) to authenticated;

-- Totals for a profile page (count(distinct species) has no PostgREST equivalent).
create or replace function profile_totals(p_user_id uuid)
returns table (catches int, species int)
language sql stable as $$
  select count(*)::int, count(distinct c.species)::int from catches c where c.user_id = p_user_id;
$$;

grant execute on function profile_totals(uuid) to authenticated;

-- ── Validation + scoring triggers on catches ─────────────────────────────────

create or replace function catches_validate() returns trigger
language plpgsql as $$
begin
  -- Skip the backdating window for migrated rows (scripts/migrate-to-supabase.js
  -- sets legacy_id); it's only meant to keep newly-logged catches honest.
  if NEW.legacy_id is null then
    if NEW.caught_at > now() + interval '5 minutes' then
      raise exception 'Catch date can''t be in the future';
    end if;
    if NEW.caught_at < now() - interval '7 days' then
      raise exception 'Catches can only be logged up to 7 days back';
    end if;
  end if;
  return NEW;
end;
$$;

create or replace function catches_compute_score() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s record;
begin
  select * into s from compute_score(NEW.species, NEW.weight_lbs, NEW.length_in);
  insert into scores (catch_id, user_id, points, base, weight_bonus, length_bonus, earned_at)
  values (NEW.id, NEW.user_id, s.total, s.base, s.weight_bonus, s.length_bonus, NEW.caught_at);
  return NEW;
end;
$$;

drop trigger if exists trg_catches_validate on catches;
create trigger trg_catches_validate before insert on catches
  for each row execute function catches_validate();

drop trigger if exists trg_catches_compute_score on catches;
create trigger trg_catches_compute_score after insert on catches
  for each row execute function catches_compute_score();

-- The trigger above only fires on new inserts — it doesn't retroactively
-- score catches that existed before it was created (e.g. migrated from the
-- old SQLite backup). Backfill any catch that doesn't have a scores row yet;
-- safe to re-run, only inserts where one is missing.
insert into scores (catch_id, user_id, points, base, weight_bonus, length_bonus, earned_at)
select c.id, c.user_id, s.total, s.base, s.weight_bonus, s.length_bonus, c.caught_at
from catches c
cross join lateral compute_score(c.species, c.weight_lbs, c.length_in) s
where not exists (select 1 from scores sc where sc.catch_id = c.id);

-- ── Read views (public to signed-in users; a view's own ORDER BY isn't
-- guaranteed to survive a query against it, so callers should still specify
-- .order() explicitly) ───────────────────────────────────────────────────────

-- LEFT JOIN scores, not an inner join: every catch should stay visible even
-- if it somehow has no scores row (this already happened once, for catches
-- migrated before the scores table/trigger existed — see the backfill
-- above). An inner join here would silently make such a catch disappear
-- from the feed/profile despite the row still existing in catches.
create or replace view catch_feed with (security_invoker = true) as
select c.id, c.user_id, c.species, c.weight_lbs, c.length_in, c.caught_at, c.location,
       c.photo_url, c.created_at, p.username,
       coalesce(s.points, 0) as points, coalesce(s.base, 0) as base,
       coalesce(s.weight_bonus, 0) as weight_bonus, coalesce(s.length_bonus, 0) as length_bonus
from catches c
join profiles p on p.id = c.user_id
left join scores s on s.catch_id = c.id;

-- Week boundaries: Monday 00:00 through the following Monday 00:00, America/New_York.
-- Both ends are computed as plain (tz-less) timestamps first — "+7 days" on a
-- naive timestamp is unambiguous calendar arithmetic — and each is converted
-- to an instant via `at time zone` only once, independently, at the end.
-- (An earlier version converted the start to a timestamptz and then added
-- interval '7 days' to THAT — which uses the database session's timezone,
-- not America/New_York, for the day arithmetic. That's a no-op most weeks,
-- but is off by exactly one hour during the US DST-transition weeks, since
-- the session timezone has no DST and New York's UTC offset does.)
create or replace view weekly_leaderboard with (security_invoker = true) as
with bounds as (
  select
    date_trunc('week', now() at time zone 'America/New_York') as week_start_local,
    date_trunc('week', now() at time zone 'America/New_York') + interval '7 days' as week_end_local
)
select
  rank() over (order by sum(s.points) desc) as rank,
  p.id as user_id, p.username, sum(s.points)::int as points, count(*)::int as catches
from scores s
join profiles p on p.id = s.user_id
cross join bounds
where s.earned_at >= (bounds.week_start_local at time zone 'America/New_York')
  and s.earned_at <  (bounds.week_end_local at time zone 'America/New_York')
group by p.id, p.username
order by points desc, catches asc, p.username;

create or replace view alltime_leaderboard with (security_invoker = true) as
select
  rank() over (order by sum(s.points) desc) as rank,
  p.id as user_id, p.username, sum(s.points)::int as points, count(*)::int as catches
from scores s
join profiles p on p.id = s.user_id
group by p.id, p.username
order by points desc, catches asc, p.username;

-- ── RLS — everything requires a signed-in session; there is no anonymous
-- read access anywhere ──────────────────────────────────────────────────────

alter table profiles enable row level security;
alter table catches enable row level security;
alter table scores enable row level security;

drop policy if exists "profiles are public" on profiles;
drop policy if exists "signed-in users can read profiles" on profiles;
create policy "signed-in users can read profiles" on profiles for select to authenticated using (true);
-- No insert/update/delete policy: profiles are written only by
-- handle_new_user() (sign-up) and profiles_protect_is_admin() guards updates
-- against is_admin regardless.

drop policy if exists "catches are public" on catches;
drop policy if exists "signed-in users can read catches" on catches;
create policy "signed-in users can read catches" on catches for select to authenticated using (true);

drop policy if exists "insert own catches" on catches;
create policy "insert own catches" on catches for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "delete own catches" on catches;
drop policy if exists "delete own or admin catches" on catches;
create policy "delete own or admin catches" on catches for delete to authenticated
  using (auth.uid() = user_id or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "scores are public" on scores;
drop policy if exists "signed-in users can read scores" on scores;
create policy "signed-in users can read scores" on scores for select to authenticated using (true);
-- No insert/update/delete policy: only the AFTER INSERT trigger (SECURITY DEFINER) writes this table.

-- ── Storage ──────────────────────────────────────────────────────────────────
-- Upload path convention: `${auth.uid()}/<filename>` — enforced below, not
-- just a client convention.

insert into storage.buckets (id, name, public)
values ('catch-photos', 'catch-photos', true)
on conflict (id) do nothing;

drop policy if exists "authenticated users can upload catch photos" on storage.objects;
drop policy if exists "users can upload to their own folder" on storage.objects;
create policy "users can upload to their own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'catch-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "owners can delete their catch photos" on storage.objects;
drop policy if exists "owners or admins can delete catch photos" on storage.objects;
create policy "owners or admins can delete catch photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'catch-photos'
    and (owner = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  );
