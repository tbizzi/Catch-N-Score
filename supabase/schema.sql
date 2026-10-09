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

-- Base points per rarity tier — the one place to change scoring by tier.
-- species.base_points used to store this redundantly per-species (the old
-- 31-species list); now species.rarity joins here instead, so bumping a
-- tier's value changes every species in it at once.
create table if not exists rarity_points (
  rarity       text primary key,
  base_points  integer not null
);

insert into rarity_points (rarity, base_points) values
  ('common', 10),
  ('uncommon', 25),
  ('rare', 50),
  ('trophy', 100),
  ('legendary', 200)
on conflict (rarity) do update set base_points = excluded.base_points;

-- Game rules. picker_visible hides a species from the Log Catch picker
-- (e.g. the old generic "Sturgeon", superseded by real sturgeon species)
-- while keeping the row so existing catches still have a valid species_fkey.
create table if not exists species (
  name            text primary key,
  rarity          text not null check (rarity in ('common', 'uncommon', 'rare', 'trophy', 'legendary')),
  typical_weight  numeric not null,
  typical_length  numeric not null,
  picker_visible  boolean not null default true
);

-- Retrofit for a species table that already existed with the old 4-tier
-- check and a base_points column (CREATE TABLE IF NOT EXISTS above is a
-- no-op against it).
alter table species add column if not exists picker_visible boolean not null default true;
alter table species drop column if exists base_points;

alter table species drop constraint if exists species_rarity_check;
alter table species add constraint species_rarity_check
  check (rarity in ('common', 'uncommon', 'rare', 'trophy', 'legendary'));

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
-- species FK, the three CHECK constraints, and ON UPDATE CASCADE on both
-- foreign keys (species' on update cascade is needed so a future species
-- rename, same pattern as the 6 above, doesn't orphan existing catches;
-- user_id's is needed for legacy profile reattachment at sign-up, see
-- handle_new_user) are all no-ops above against a pre-existing table.
do $$
declare
  fk_name text;
begin
  select tc.constraint_name into fk_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
  where tc.table_name = 'catches' and tc.constraint_type = 'FOREIGN KEY' and kcu.column_name = 'species';
  if fk_name is not null then
    execute format('alter table catches drop constraint %I', fk_name);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catches_species_fkey') then
    alter table catches add constraint catches_species_fkey
      foreign key (species) references species (name) on update cascade;
  end if;
end $$;

-- Renames — done as updates to the existing row (not delete+insert) so
-- existing catches, which reference species by name, keep working and keep
-- their already-computed scores untouched. Placed after the catches table
-- (below) adds ON UPDATE CASCADE to catches_species_fkey — otherwise this
-- would fail outright against an already-live database, where any catch
-- referencing a renamed species blocks the rename under the old, no-cascade
-- version of that FK. A no-op once already applied (the old name won't
-- exist anymore to match).
update species set name = 'Crappie (Black)'        where name = 'Black Crappie'   and not exists (select 1 from species where name = 'Crappie (Black)');
update species set name = 'Crappie (White)'        where name = 'White Crappie'   and not exists (select 1 from species where name = 'Crappie (White)');
update species set name = 'Red Drum (Redfish)'     where name = 'Redfish'         and not exists (select 1 from species where name = 'Red Drum (Redfish)');
update species set name = 'Spotted Seatrout'       where name = 'Speckled Trout'  and not exists (select 1 from species where name = 'Spotted Seatrout');
update species set name = 'Flounder (Southern)'    where name = 'Flounder'        and not exists (select 1 from species where name = 'Flounder (Southern)');
update species set name = 'Snook (Common)'         where name = 'Snook'           and not exists (select 1 from species where name = 'Snook (Common)');

-- Full species catalog (198 species from the picker list, plus the old
-- generic "Sturgeon" kept for existing catches but hidden from the picker,
-- plus "Other" kept as the picker's fallback option). Renamed rows above
-- are updated in place by this upsert; every other pre-existing species
-- name below also just gets its data refreshed, same row, same catches.
insert into species (name, rarity, typical_weight, typical_length, picker_visible) values
  ('African Pompano', 'rare', 10, 24, true),
  ('Albacore', 'rare', 15, 30, true),
  ('Alligator Gar', 'trophy', 100, 72, true),
  ('Almaco Jack', 'rare', 12, 30, true),
  ('Amberjack (Greater)', 'rare', 25, 40, true),
  ('Arapaima', 'legendary', 150, 80, true),
  ('Arctic Char', 'uncommon', 4, 20, true),
  ('Atlantic Salmon', 'rare', 10, 30, true),
  ('Atlantic Sharpnose Shark', 'uncommon', 4, 30, true),
  ('Barracuda', 'rare', 8, 36, true),
  ('Bigeye Thresher', 'trophy', 100, 150, true),
  ('Bigeye Tuna', 'trophy', 60, 50, true),
  ('Bighead Carp', 'common', 20, 34, true),
  ('Black Carp', 'common', 15, 32, true),
  ('Black Drum', 'uncommon', 8, 24, true),
  ('Black Grouper', 'rare', 20, 32, true),
  ('Black Marlin', 'legendary', 250, 110, true),
  ('Black Sea Bass', 'uncommon', 1.5, 14, true),
  ('Blackfin Tuna', 'rare', 10, 24, true),
  ('Blacknose Shark', 'uncommon', 8, 36, true),
  ('Blacktip Shark', 'rare', 18, 48, true),
  ('Blue Catfish', 'uncommon', 15, 30, true),
  ('Blue Marlin', 'legendary', 200, 108, true),
  ('Blue Shark', 'rare', 60, 84, true),
  ('Bluefin Tuna', 'legendary', 200, 72, true),
  ('Bluefish', 'uncommon', 4, 22, true),
  ('Bluegill', 'common', 0.5, 7.5, true),
  ('Bonefish', 'trophy', 4, 24, true),
  ('Bonito', 'uncommon', 4, 20, true),
  ('Bonnethead', 'uncommon', 6, 30, true),
  ('Bowfin', 'uncommon', 4, 24, true),
  ('Brook Trout', 'uncommon', 1.5, 12, true),
  ('Brown Trout', 'uncommon', 4, 19, true),
  ('Buffalo (Bigmouth)', 'common', 12, 28, true),
  ('Buffalo (Black)', 'common', 10, 26, true),
  ('Buffalo (Smallmouth)', 'common', 8, 24, true),
  ('Bull Shark', 'trophy', 150, 84, true),
  ('Bull Trout', 'uncommon', 6, 24, true),
  ('Bullhead (Black)', 'common', 0.75, 10, true),
  ('Bullhead (Brown)', 'common', 0.75, 10, true),
  ('Bullhead (Yellow)', 'common', 0.6, 9, true),
  ('Burbot', 'uncommon', 2, 20, true),
  ('Cabezon', 'uncommon', 4, 20, true),
  ('California Corbina', 'uncommon', 2, 20, true),
  ('California Halibut', 'rare', 8, 24, true),
  ('California Sheephead', 'uncommon', 4, 20, true),
  ('Caribbean Reef Shark', 'rare', 35, 66, true),
  ('Cero Mackerel', 'rare', 4, 24, true),
  ('Chain Pickerel', 'uncommon', 1.5, 18, true),
  ('Channel Catfish', 'uncommon', 4, 22, true),
  ('Chinook Salmon', 'rare', 15, 33, true),
  ('Chum Salmon', 'rare', 10, 28, true),
  ('Cobia', 'rare', 25, 40, true),
  ('Coho Salmon', 'rare', 9, 26, true),
  ('Common Carp', 'common', 8, 24, true),
  ('Crappie (Black)', 'common', 0.8, 10, true),
  ('Crappie (White)', 'common', 0.8, 10, true),
  ('Croaker', 'common', 0.5, 10, true),
  ('Cubera Snapper', 'trophy', 40, 36, true),
  ('Cutthroat Trout', 'uncommon', 2, 15, true),
  ('Dog Snapper', 'rare', 8, 24, true),
  ('Dusky Shark', 'rare', 100, 84, true),
  ('False Albacore', 'uncommon', 6, 24, true),
  ('Finetooth Shark', 'rare', 15, 48, true),
  ('Flathead Catfish', 'uncommon', 12, 28, true),
  ('Florida Gar', 'uncommon', 3, 24, true),
  ('Flounder (Southern)', 'uncommon', 2, 16, true),
  ('Freshwater Drum', 'common', 2, 16, true),
  ('Gag Grouper', 'rare', 15, 30, true),
  ('Galapagos Shark', 'rare', 80, 84, true),
  ('Giant Trevally', 'trophy', 30, 40, true),
  ('Golden Dorado', 'rare', 15, 30, true),
  ('Golden Tilefish', 'rare', 15, 34, true),
  ('Golden Trout', 'uncommon', 1, 11, true),
  ('Goliath Grouper', 'trophy', 100, 60, true),
  ('Grass Carp', 'common', 15, 32, true),
  ('Gray Snapper', 'uncommon', 2, 15, true),
  ('Great Hammerhead', 'legendary', 200, 120, true),
  ('Green Sunfish', 'common', 0.3, 6, true),
  ('Guadalupe Bass', 'uncommon', 0.75, 10, true),
  ('Gulf Flounder', 'uncommon', 1.5, 14, true),
  ('Hogfish', 'rare', 5, 20, true),
  ('Hybrid Striped Bass', 'uncommon', 4, 20, true),
  ('Jack Crevalle', 'uncommon', 6, 20, true),
  ('King Mackerel', 'rare', 10, 36, true),
  ('Kingfish (Southern Kingfish)', 'common', 0.5, 10, true),
  ('Kokanee', 'uncommon', 1.5, 14, true),
  ('Ladyfish', 'common', 1.5, 18, true),
  ('Lake Sturgeon', 'trophy', 20, 45, true),
  ('Lake Trout', 'uncommon', 8, 26, true),
  ('Lane Snapper', 'common', 1, 10, true),
  ('Largemouth Bass', 'uncommon', 5, 18, true),
  ('Lemon Shark', 'rare', 60, 84, true),
  ('Lesser Amberjack', 'rare', 8, 22, true),
  ('Lingcod', 'rare', 10, 30, true),
  ('Longfin Mako', 'trophy', 80, 78, true),
  ('Longnose Gar', 'uncommon', 5, 36, true),
  ('Mahi-Mahi (Dolphinfish)', 'rare', 15, 36, true),
  ('Mangrove Snapper', 'uncommon', 2, 16, true),
  ('Muskellunge', 'trophy', 15, 40, true),
  ('Mutton Snapper', 'rare', 10, 26, true),
  ('Nassau Grouper', 'rare', 8, 24, true),
  ('Northern Pike', 'rare', 6, 28, true),
  ('Nurse Shark', 'rare', 90, 84, true),
  ('Oceanic Whitetip', 'rare', 70, 72, true),
  ('Oscar', 'common', 1, 10, true),
  ('Pacific Crevalle Jack', 'uncommon', 6, 20, true),
  ('Pacu', 'uncommon', 5, 20, true),
  ('Paddlefish', 'trophy', 25, 45, true),
  ('Payara', 'rare', 12, 30, true),
  ('Peacock Bass', 'trophy', 8, 22, true),
  ('Permit', 'trophy', 15, 28, true),
  ('Pink Salmon', 'rare', 4, 20, true),
  ('Piranha', 'uncommon', 1.5, 11, true),
  ('Pompano', 'uncommon', 1.5, 14, true),
  ('Porbeagle', 'rare', 80, 72, true),
  ('Pumpkinseed', 'common', 0.3, 6, true),
  ('Queen Triggerfish', 'uncommon', 2, 14, true),
  ('Rainbow Runner', 'uncommon', 5, 24, true),
  ('Rainbow Trout', 'uncommon', 3, 18, true),
  ('Red Drum (Redfish)', 'uncommon', 6, 24, true),
  ('Red Grouper', 'rare', 10, 26, true),
  ('Red Snapper', 'rare', 10, 26, true),
  ('Redear Sunfish', 'common', 0.75, 9, true),
  ('Redeye Bass', 'uncommon', 0.75, 10, true),
  ('Redfin Pickerel', 'common', 0.3, 10, true),
  ('Redtail Catfish', 'rare', 20, 36, true),
  ('Rock Bass', 'common', 0.5, 8, true),
  ('Rockfish', 'uncommon', 2, 16, true),
  ('Roosterfish', 'trophy', 20, 36, true),
  ('Sailfish', 'trophy', 50, 84, true),
  ('Sand Tiger Shark', 'rare', 100, 84, true),
  ('Sandbar Shark', 'rare', 70, 72, true),
  ('Sauger', 'rare', 1.5, 15, true),
  ('Saugeye', 'rare', 3, 20, true),
  ('Scalloped Hammerhead', 'trophy', 100, 96, true),
  ('Scamp', 'rare', 6, 22, true),
  ('Schoolmaster', 'common', 1, 12, true),
  ('Sevengill Shark', 'rare', 80, 72, true),
  ('Sheepshead', 'uncommon', 3, 16, true),
  ('Shoal Bass', 'uncommon', 2, 15, true),
  ('Shortbill Spearfish', 'trophy', 30, 60, true),
  ('Shortfin Mako', 'trophy', 100, 84, true),
  ('Shortnose Gar', 'common', 2, 20, true),
  ('Shovelnose Sturgeon', 'rare', 3, 24, true),
  ('Silky Shark', 'rare', 70, 84, true),
  ('Silver Carp', 'common', 10, 28, true),
  ('Sixgill Shark', 'rare', 300, 144, true),
  ('Skipjack Tuna', 'uncommon', 6, 20, true),
  ('Smallmouth Bass', 'uncommon', 3, 16, true),
  ('Smooth Hammerhead', 'trophy', 100, 96, true),
  ('Snakehead', 'rare', 5, 24, true),
  ('Snook (Common)', 'rare', 7, 28, true),
  ('Snowy Grouper', 'rare', 15, 30, true),
  ('Sockeye Salmon', 'rare', 6, 24, true),
  ('Spanish Mackerel', 'rare', 2.5, 20, true),
  ('Spearfish (Longbill)', 'trophy', 35, 66, true),
  ('Spinner Shark', 'rare', 40, 72, true),
  ('Spot', 'common', 0.2, 7, true),
  ('Spotted Bass', 'uncommon', 2, 14, true),
  ('Spotted Gar', 'uncommon', 3, 24, true),
  ('Spotted Seatrout', 'uncommon', 2, 18, true),
  ('Stingray', 'common', 10, 30, true),
  ('Striped Bass', 'rare', 15, 30, true),
  ('Striped Marlin', 'legendary', 120, 100, true),
  ('Summer Flounder', 'uncommon', 3, 18, true),
  ('Surubí', 'rare', 15, 36, true),
  ('Suwannee Bass', 'uncommon', 0.75, 10, true),
  ('Swordfish', 'legendary', 150, 90, true),
  ('Taimen', 'legendary', 30, 45, true),
  ('Tarpon', 'trophy', 60, 50, true),
  ('Thresher Shark', 'trophy', 90, 144, true),
  ('Tiger Muskie', 'trophy', 12, 38, true),
  ('Tiger Shark', 'legendary', 300, 120, true),
  ('Tiger Shovelnose Catfish', 'rare', 15, 36, true),
  ('Tilefish', 'rare', 10, 30, true),
  ('Triggerfish (Gray)', 'uncommon', 2, 14, true),
  ('Tripletail', 'rare', 8, 20, true),
  ('Vermilion Snapper', 'uncommon', 1.5, 14, true),
  ('Wahoo', 'rare', 25, 48, true),
  ('Walleye', 'rare', 4, 22, true),
  ('Warmouth', 'common', 0.4, 7, true),
  ('Warsaw Grouper', 'trophy', 80, 55, true),
  ('Weakfish', 'uncommon', 2, 18, true),
  ('White Bass', 'common', 1.2, 14, true),
  ('White Catfish', 'uncommon', 2, 16, true),
  ('White Marlin', 'legendary', 70, 72, true),
  ('White Perch', 'common', 0.6, 10, true),
  ('White Seabass', 'rare', 15, 30, true),
  ('White Sturgeon', 'trophy', 40, 60, true),
  ('Whiting', 'common', 0.75, 12, true),
  ('Wreckfish', 'rare', 25, 36, true),
  ('Yellow Bass', 'common', 0.6, 10, true),
  ('Yellow Jack', 'uncommon', 3, 18, true),
  ('Yellow Perch', 'uncommon', 0.6, 10, true),
  ('Yellowedge Grouper', 'rare', 15, 30, true),
  ('Yellowfin Tuna', 'trophy', 40, 48, true),
  ('Yellowtail Snapper', 'uncommon', 2, 15, true),
  ('Sturgeon', 'trophy', 40, 55, false),
  ('Other', 'common', 2, 12, true)
on conflict (name) do update set
  rarity = excluded.rarity, typical_weight = excluded.typical_weight,
  typical_length = excluded.typical_length, picker_visible = excluded.picker_visible;

-- Category/subgroup for the Log Catch picker. A species can appear in more
-- than one group (Striped Bass, King/Spanish Mackerel, Blacktip Shark) while
-- staying one row in species above — this table is purely picker display,
-- many rows per species name allowed. subgroup is null for Saltwater
-- Inshore, which the picker renders as one flat list under that category.
create table if not exists species_groups (
  id            bigint generated always as identity primary key,
  species_name  text not null references species (name) on delete cascade on update cascade,
  category      text not null,
  subgroup      text,
  sort_order    integer not null default 0,
  unique (species_name, category, subgroup)
);

insert into species_groups (species_name, category, subgroup, sort_order) values
  ('Largemouth Bass', 'Freshwater', 'Black Bass', 0),
  ('Smallmouth Bass', 'Freshwater', 'Black Bass', 1),
  ('Spotted Bass', 'Freshwater', 'Black Bass', 2),
  ('Guadalupe Bass', 'Freshwater', 'Black Bass', 3),
  ('Suwannee Bass', 'Freshwater', 'Black Bass', 4),
  ('Redeye Bass', 'Freshwater', 'Black Bass', 5),
  ('Shoal Bass', 'Freshwater', 'Black Bass', 6),
  ('Rainbow Trout', 'Freshwater', 'Trout & Salmon', 0),
  ('Brown Trout', 'Freshwater', 'Trout & Salmon', 1),
  ('Brook Trout', 'Freshwater', 'Trout & Salmon', 2),
  ('Cutthroat Trout', 'Freshwater', 'Trout & Salmon', 3),
  ('Lake Trout', 'Freshwater', 'Trout & Salmon', 4),
  ('Bull Trout', 'Freshwater', 'Trout & Salmon', 5),
  ('Golden Trout', 'Freshwater', 'Trout & Salmon', 6),
  ('Arctic Char', 'Freshwater', 'Trout & Salmon', 7),
  ('Atlantic Salmon', 'Freshwater', 'Trout & Salmon', 8),
  ('Chinook Salmon', 'Freshwater', 'Trout & Salmon', 9),
  ('Coho Salmon', 'Freshwater', 'Trout & Salmon', 10),
  ('Sockeye Salmon', 'Freshwater', 'Trout & Salmon', 11),
  ('Pink Salmon', 'Freshwater', 'Trout & Salmon', 12),
  ('Chum Salmon', 'Freshwater', 'Trout & Salmon', 13),
  ('Kokanee', 'Freshwater', 'Trout & Salmon', 14),
  ('Bluegill', 'Freshwater', 'Panfish', 0),
  ('Redear Sunfish', 'Freshwater', 'Panfish', 1),
  ('Pumpkinseed', 'Freshwater', 'Panfish', 2),
  ('Green Sunfish', 'Freshwater', 'Panfish', 3),
  ('Warmouth', 'Freshwater', 'Panfish', 4),
  ('Crappie (Black)', 'Freshwater', 'Panfish', 5),
  ('Crappie (White)', 'Freshwater', 'Panfish', 6),
  ('Rock Bass', 'Freshwater', 'Panfish', 7),
  ('Blue Catfish', 'Freshwater', 'Catfish', 0),
  ('Channel Catfish', 'Freshwater', 'Catfish', 1),
  ('Flathead Catfish', 'Freshwater', 'Catfish', 2),
  ('White Catfish', 'Freshwater', 'Catfish', 3),
  ('Bullhead (Black)', 'Freshwater', 'Catfish', 4),
  ('Bullhead (Brown)', 'Freshwater', 'Catfish', 5),
  ('Bullhead (Yellow)', 'Freshwater', 'Catfish', 6),
  ('Northern Pike', 'Freshwater', 'Pike Family', 0),
  ('Muskellunge', 'Freshwater', 'Pike Family', 1),
  ('Tiger Muskie', 'Freshwater', 'Pike Family', 2),
  ('Chain Pickerel', 'Freshwater', 'Pike Family', 3),
  ('Redfin Pickerel', 'Freshwater', 'Pike Family', 4),
  ('Walleye', 'Freshwater', 'Walleye Family', 0),
  ('Sauger', 'Freshwater', 'Walleye Family', 1),
  ('Saugeye', 'Freshwater', 'Walleye Family', 2),
  ('Alligator Gar', 'Freshwater', 'Gar', 0),
  ('Longnose Gar', 'Freshwater', 'Gar', 1),
  ('Spotted Gar', 'Freshwater', 'Gar', 2),
  ('Florida Gar', 'Freshwater', 'Gar', 3),
  ('Shortnose Gar', 'Freshwater', 'Gar', 4),
  ('Peacock Bass', 'Freshwater', 'Other Popular Freshwater Species', 0),
  ('Snakehead', 'Freshwater', 'Other Popular Freshwater Species', 1),
  ('Bowfin', 'Freshwater', 'Other Popular Freshwater Species', 2),
  ('Freshwater Drum', 'Freshwater', 'Other Popular Freshwater Species', 3),
  ('White Bass', 'Freshwater', 'Other Popular Freshwater Species', 4),
  ('Yellow Bass', 'Freshwater', 'Other Popular Freshwater Species', 5),
  ('Striped Bass', 'Freshwater', 'Other Popular Freshwater Species', 6),
  ('Hybrid Striped Bass', 'Freshwater', 'Other Popular Freshwater Species', 7),
  ('White Perch', 'Freshwater', 'Other Popular Freshwater Species', 8),
  ('Yellow Perch', 'Freshwater', 'Other Popular Freshwater Species', 9),
  ('Common Carp', 'Freshwater', 'Other Popular Freshwater Species', 10),
  ('Grass Carp', 'Freshwater', 'Other Popular Freshwater Species', 11),
  ('Bighead Carp', 'Freshwater', 'Other Popular Freshwater Species', 12),
  ('Black Carp', 'Freshwater', 'Other Popular Freshwater Species', 13),
  ('Silver Carp', 'Freshwater', 'Other Popular Freshwater Species', 14),
  ('Buffalo (Bigmouth)', 'Freshwater', 'Other Popular Freshwater Species', 15),
  ('Buffalo (Smallmouth)', 'Freshwater', 'Other Popular Freshwater Species', 16),
  ('Buffalo (Black)', 'Freshwater', 'Other Popular Freshwater Species', 17),
  ('Paddlefish', 'Freshwater', 'Other Popular Freshwater Species', 18),
  ('Lake Sturgeon', 'Freshwater', 'Other Popular Freshwater Species', 19),
  ('White Sturgeon', 'Freshwater', 'Other Popular Freshwater Species', 20),
  ('Shovelnose Sturgeon', 'Freshwater', 'Other Popular Freshwater Species', 21),
  ('Burbot', 'Freshwater', 'Other Popular Freshwater Species', 22),
  ('Taimen', 'Freshwater', 'Other Popular Freshwater Species', 23),
  ('Pacu', 'Freshwater', 'Other Popular Freshwater Species', 24),
  ('Piranha', 'Freshwater', 'Other Popular Freshwater Species', 25),
  ('Arapaima', 'Freshwater', 'Other Popular Freshwater Species', 26),
  ('Payara', 'Freshwater', 'Other Popular Freshwater Species', 27),
  ('Golden Dorado', 'Freshwater', 'Other Popular Freshwater Species', 28),
  ('Tiger Shovelnose Catfish', 'Freshwater', 'Other Popular Freshwater Species', 29),
  ('Redtail Catfish', 'Freshwater', 'Other Popular Freshwater Species', 30),
  ('Surubí', 'Freshwater', 'Other Popular Freshwater Species', 31),
  ('Oscar', 'Freshwater', 'Other Popular Freshwater Species', 32),
  ('Red Drum (Redfish)', 'Saltwater Inshore', null, 0),
  ('Spotted Seatrout', 'Saltwater Inshore', null, 1),
  ('Weakfish', 'Saltwater Inshore', null, 2),
  ('Black Drum', 'Saltwater Inshore', null, 3),
  ('Sheepshead', 'Saltwater Inshore', null, 4),
  ('Snook (Common)', 'Saltwater Inshore', null, 5),
  ('Tarpon', 'Saltwater Inshore', null, 6),
  ('Bonefish', 'Saltwater Inshore', null, 7),
  ('Permit', 'Saltwater Inshore', null, 8),
  ('Tripletail', 'Saltwater Inshore', null, 9),
  ('Flounder (Southern)', 'Saltwater Inshore', null, 10),
  ('Gulf Flounder', 'Saltwater Inshore', null, 11),
  ('Summer Flounder', 'Saltwater Inshore', null, 12),
  ('California Halibut', 'Saltwater Inshore', null, 13),
  ('Striped Bass', 'Saltwater Inshore', null, 14),
  ('Bluefish', 'Saltwater Inshore', null, 15),
  ('Ladyfish', 'Saltwater Inshore', null, 16),
  ('Jack Crevalle', 'Saltwater Inshore', null, 17),
  ('Pompano', 'Saltwater Inshore', null, 18),
  ('Whiting', 'Saltwater Inshore', null, 19),
  ('Croaker', 'Saltwater Inshore', null, 20),
  ('Spot', 'Saltwater Inshore', null, 21),
  ('Kingfish (Southern Kingfish)', 'Saltwater Inshore', null, 22),
  ('Spanish Mackerel', 'Saltwater Inshore', null, 23),
  ('King Mackerel', 'Saltwater Inshore', null, 24),
  ('Cobia', 'Saltwater Inshore', null, 25),
  ('Barracuda', 'Saltwater Inshore', null, 26),
  ('Blacktip Shark', 'Saltwater Inshore', null, 27),
  ('Stingray', 'Saltwater Inshore', null, 28),
  ('Goliath Grouper', 'Reef/Bottom', 'Groupers', 0),
  ('Gag Grouper', 'Reef/Bottom', 'Groupers', 1),
  ('Red Grouper', 'Reef/Bottom', 'Groupers', 2),
  ('Black Grouper', 'Reef/Bottom', 'Groupers', 3),
  ('Scamp', 'Reef/Bottom', 'Groupers', 4),
  ('Snowy Grouper', 'Reef/Bottom', 'Groupers', 5),
  ('Yellowedge Grouper', 'Reef/Bottom', 'Groupers', 6),
  ('Warsaw Grouper', 'Reef/Bottom', 'Groupers', 7),
  ('Nassau Grouper', 'Reef/Bottom', 'Groupers', 8),
  ('Red Snapper', 'Reef/Bottom', 'Snappers', 0),
  ('Mangrove Snapper', 'Reef/Bottom', 'Snappers', 1),
  ('Mutton Snapper', 'Reef/Bottom', 'Snappers', 2),
  ('Yellowtail Snapper', 'Reef/Bottom', 'Snappers', 3),
  ('Vermilion Snapper', 'Reef/Bottom', 'Snappers', 4),
  ('Cubera Snapper', 'Reef/Bottom', 'Snappers', 5),
  ('Dog Snapper', 'Reef/Bottom', 'Snappers', 6),
  ('Lane Snapper', 'Reef/Bottom', 'Snappers', 7),
  ('Schoolmaster', 'Reef/Bottom', 'Snappers', 8),
  ('Gray Snapper', 'Reef/Bottom', 'Snappers', 9),
  ('Hogfish', 'Reef/Bottom', 'Reef Species', 0),
  ('Black Sea Bass', 'Reef/Bottom', 'Reef Species', 1),
  ('White Seabass', 'Reef/Bottom', 'Reef Species', 2),
  ('California Sheephead', 'Reef/Bottom', 'Reef Species', 3),
  ('Triggerfish (Gray)', 'Reef/Bottom', 'Reef Species', 4),
  ('Queen Triggerfish', 'Reef/Bottom', 'Reef Species', 5),
  ('Amberjack (Greater)', 'Reef/Bottom', 'Reef Species', 6),
  ('Lesser Amberjack', 'Reef/Bottom', 'Reef Species', 7),
  ('Almaco Jack', 'Reef/Bottom', 'Reef Species', 8),
  ('Yellow Jack', 'Reef/Bottom', 'Reef Species', 9),
  ('African Pompano', 'Reef/Bottom', 'Reef Species', 10),
  ('Tilefish', 'Reef/Bottom', 'Reef Species', 11),
  ('Golden Tilefish', 'Reef/Bottom', 'Reef Species', 12),
  ('Wreckfish', 'Reef/Bottom', 'Reef Species', 13),
  ('Lingcod', 'Reef/Bottom', 'Reef Species', 14),
  ('Cabezon', 'Reef/Bottom', 'Reef Species', 15),
  ('Rockfish', 'Reef/Bottom', 'Reef Species', 16),
  ('California Corbina', 'Reef/Bottom', 'Reef Species', 17),
  ('Blue Marlin', 'Pelagic/Billfish', 'Billfish', 0),
  ('White Marlin', 'Pelagic/Billfish', 'Billfish', 1),
  ('Black Marlin', 'Pelagic/Billfish', 'Billfish', 2),
  ('Striped Marlin', 'Pelagic/Billfish', 'Billfish', 3),
  ('Sailfish', 'Pelagic/Billfish', 'Billfish', 4),
  ('Swordfish', 'Pelagic/Billfish', 'Billfish', 5),
  ('Spearfish (Longbill)', 'Pelagic/Billfish', 'Billfish', 6),
  ('Shortbill Spearfish', 'Pelagic/Billfish', 'Billfish', 7),
  ('Bluefin Tuna', 'Pelagic/Billfish', 'Tuna', 0),
  ('Yellowfin Tuna', 'Pelagic/Billfish', 'Tuna', 1),
  ('Bigeye Tuna', 'Pelagic/Billfish', 'Tuna', 2),
  ('Blackfin Tuna', 'Pelagic/Billfish', 'Tuna', 3),
  ('Albacore', 'Pelagic/Billfish', 'Tuna', 4),
  ('Skipjack Tuna', 'Pelagic/Billfish', 'Tuna', 5),
  ('Mahi-Mahi (Dolphinfish)', 'Pelagic/Billfish', 'Other Pelagics', 0),
  ('Wahoo', 'Pelagic/Billfish', 'Other Pelagics', 1),
  ('King Mackerel', 'Pelagic/Billfish', 'Other Pelagics', 2),
  ('Spanish Mackerel', 'Pelagic/Billfish', 'Other Pelagics', 3),
  ('Cero Mackerel', 'Pelagic/Billfish', 'Other Pelagics', 4),
  ('Bonito', 'Pelagic/Billfish', 'Other Pelagics', 5),
  ('False Albacore', 'Pelagic/Billfish', 'Other Pelagics', 6),
  ('Rainbow Runner', 'Pelagic/Billfish', 'Other Pelagics', 7),
  ('Roosterfish', 'Pelagic/Billfish', 'Other Pelagics', 8),
  ('Giant Trevally', 'Pelagic/Billfish', 'Other Pelagics', 9),
  ('Pacific Crevalle Jack', 'Pelagic/Billfish', 'Other Pelagics', 10),
  ('Blacktip Shark', 'Sharks', 'Coastal Sharks', 0),
  ('Spinner Shark', 'Sharks', 'Coastal Sharks', 1),
  ('Bull Shark', 'Sharks', 'Coastal Sharks', 2),
  ('Lemon Shark', 'Sharks', 'Coastal Sharks', 3),
  ('Sandbar Shark', 'Sharks', 'Coastal Sharks', 4),
  ('Sand Tiger Shark', 'Sharks', 'Coastal Sharks', 5),
  ('Atlantic Sharpnose Shark', 'Sharks', 'Coastal Sharks', 6),
  ('Bonnethead', 'Sharks', 'Coastal Sharks', 7),
  ('Finetooth Shark', 'Sharks', 'Coastal Sharks', 8),
  ('Nurse Shark', 'Sharks', 'Coastal Sharks', 9),
  ('Tiger Shark', 'Sharks', 'Coastal Sharks', 10),
  ('Dusky Shark', 'Sharks', 'Coastal Sharks', 11),
  ('Shortfin Mako', 'Sharks', 'Pelagic Sharks', 0),
  ('Longfin Mako', 'Sharks', 'Pelagic Sharks', 1),
  ('Blue Shark', 'Sharks', 'Pelagic Sharks', 2),
  ('Thresher Shark', 'Sharks', 'Pelagic Sharks', 3),
  ('Bigeye Thresher', 'Sharks', 'Pelagic Sharks', 4),
  ('Oceanic Whitetip', 'Sharks', 'Pelagic Sharks', 5),
  ('Porbeagle', 'Sharks', 'Pelagic Sharks', 6),
  ('Great Hammerhead', 'Sharks', 'Hammerheads', 0),
  ('Scalloped Hammerhead', 'Sharks', 'Hammerheads', 1),
  ('Smooth Hammerhead', 'Sharks', 'Hammerheads', 2),
  ('Sevengill Shark', 'Sharks', 'Other Game Sharks', 0),
  ('Sixgill Shark', 'Sharks', 'Other Game Sharks', 1),
  ('Silky Shark', 'Sharks', 'Other Game Sharks', 2),
  ('Caribbean Reef Shark', 'Sharks', 'Other Game Sharks', 3),
  ('Galapagos Shark', 'Sharks', 'Other Game Sharks', 4),
  ('Blacknose Shark', 'Sharks', 'Other Game Sharks', 5)
on conflict (species_name, category, subgroup) do update set sort_order = excluded.sort_order;

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

-- ── Scoring — THE place to change scoring (ported from
-- server/src/lib/scoring.js, temporary pending a real rework): per-tier base
-- points are rarity_points above; per-species typical size is species.
-- WEIGHT_FACTOR 0.75, LENGTH_FACTOR 0.5, RATIO_CAP 4, MAX_PLAUSIBLE_RATIO 20.

create or replace function compute_score(p_species text, p_weight numeric, p_length numeric)
returns table (total int, base int, weight_bonus int, length_bonus int)
language plpgsql stable as $$
declare
  sp species%rowtype;
  bp int;
  weight_ratio numeric;
  length_ratio numeric;
  wb int;
  lb int;
begin
  select * into sp from species where name = p_species;
  if sp is null then
    raise exception 'Unknown species';
  end if;
  select base_points into bp from rarity_points where rarity = sp.rarity;
  weight_ratio := least(p_weight / sp.typical_weight, 4);
  length_ratio := least(p_length / sp.typical_length, 4);
  wb := round(bp * 0.75 * weight_ratio);
  lb := round(bp * 0.5 * length_ratio);
  return query select (bp + wb + lb)::int, bp, wb, lb;
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
  -- 20x typical, not the old 10x: with 198 species of very different size
  -- variance (a 10x cap that comfortably fits a trophy Bluegill would reject
  -- a perfectly real trophy Blue Catfish or Bluefin Tuna), this is a typo
  -- catcher, not a species-specific plausibility model — still comfortably
  -- below any species' actual world record in this list.
  if p_weight > sp.typical_weight * 20 then
    raise exception 'That weight looks too high for a %', sp.name;
  end if;
  if p_length > sp.typical_length * 20 then
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

-- ── Species views (no RLS — reference data, same as species itself) ────────

-- Every species with its tier's base points joined in, no species.rarity
-- having its own stored (and driftable) copy. requirePhoto/maxBackdateDays
-- aren't here; those stay as client-only UX constants (see gameConfig.js).
create or replace view species_catalog as
select s.name, s.rarity, s.typical_weight, s.typical_length, s.picker_visible, rp.base_points
from species s
join rarity_points rp on rp.rarity = s.rarity;

-- Everything the Log Catch picker needs in one query: one row per
-- (species, group) pairing — a dual-listed species (Striped Bass, King/
-- Spanish Mackerel, Blacktip Shark) appears twice, once per group, by
-- design. picker_visible = false (just "Sturgeon") never appears here, and
-- "Other" isn't in species_groups at all — the client appends it itself as
-- a final, ungrouped option (see api.js).
create or replace view species_picker as
select g.category, g.subgroup, g.sort_order, c.name, c.rarity, c.base_points, c.typical_weight, c.typical_length
from species_groups g
join species_catalog c on c.name = g.species_name
where c.picker_visible
order by g.category, g.subgroup nulls first, g.sort_order, c.name;

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
