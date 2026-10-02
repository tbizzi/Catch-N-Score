# 🎣 Catch N' Score

Log your catches, earn points by species, weight and length, and climb the weekly and all-time leaderboards.

**Stack:** React (Vite) · Supabase (Postgres, Auth, Storage) for all data · a thin Node/Express server that
just serves the built app.

## Run it

Requires **Node 22.13+** (Node 24 LTS recommended) and a Supabase project.

1. Run [`supabase/schema.sql`](supabase/schema.sql) once in that project's SQL editor.
2. `cd client && cp .env.example .env.local`, fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
   (Settings → API — the **publishable/anon** key, never the service role key).
3. From the repo root:
   ```bash
   npm install
   npm run dev   # Vite on http://localhost:5173
   ```

There's no API to run alongside it — the client talks to Supabase directly, gated by the Row Level Security
policies in `schema.sql`. The dev server is exposed on your network, so you can open
`http://<your-computer-ip>:5173` on your phone.

Production: `npm run build && npm start` — Express serves the built app on port `3000` (`PORT` to override).
Set `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` as real build-time env vars wherever you build it
(e.g. in Coolify), and `TRUST_PROXY` if it's behind a proxy.

## Identity

Real accounts: email + password via Supabase Auth, plus a unique username chosen at sign-up. `profiles.id`
equals `auth.users.id`; the `handle_new_user` trigger in `schema.sql` creates that row (validating the
username's format and uniqueness itself, for a readable error instead of a raw constraint violation). Logging
in accepts either an email or a username — a username is resolved to its email first via the `email_for_login`
security-definer function, which returns only the email, nothing else. The whole app — every page, the feed,
logging a catch — requires a signed-in session; a logged-out visitor sees only the login/sign-up screen, and
there's a "forgot password" flow (`resetPasswordForEmail` + `updateUser({ password })`) for the rest.

**Admin:** `profiles.is_admin` lets an account delete any catch (and its photo), not just its own. There's no
sign-up option for it — grant it to your own account by hand with [`supabase/grant-admin.sql`](supabase/grant-admin.sql).
It cannot be changed through the app: no RLS policy grants `authenticated` write access to `profiles` at all,
and a trigger additionally reverts any attempted change to `is_admin` that arrives through the API (as opposed
to a direct SQL-editor connection, which is how `grant-admin.sql` is meant to be run).

**Legacy data:** the 2 profiles carried over from the pre-Supabase SQLite backup (via `scripts/migrate-to-supabase.js`)
have no real account behind them yet. If someone signs up with a username matching one of those profiles,
`handle_new_user` re-keys that profile onto the new account instead of creating a second one, so its catch
history moves over automatically (`ON UPDATE CASCADE` on `catches.user_id`/`scores.user_id`). This is pure
username-matching with no further proof of identity — fine for 2 people in a friends-only game, but worth
knowing: whoever signs up first with that exact name inherits the history.

## Changing the scoring

The authoritative rules live in `supabase/schema.sql`: the `species` table (rarity tier, typical weight/length
per species) and the `compute_score()`/`preview_score()` functions (base points per rarity, the weight/length
bonus factors, the ratio cap). A trigger calls `compute_score()` when a catch is inserted and writes the
`scores` row — the client never sends its own score, so there's nothing to recompute after an edit; existing
catches keep whatever score they were given at insert time. `client/src/gameConfig.js` duplicates the
non-scoring constants (backdating window, photo requirement) for UI purposes only — keep both in sync.

## Migrating old data

`scripts/migrate-to-supabase.js` is a one-time script that copies a SQLite backup (from before this app moved
to Supabase) into a Supabase project — see the comment at the top of that file for usage. It needs the
project's **service role** key, set locally in a gitignored `.env` (never in client code or your host's env
vars) — see `.env.example` at the repo root.

## Layout

```
supabase/
  schema.sql          tables, RLS policies, triggers, views, storage policies — the source of truth
  grant-admin.sql      run by hand once, to set your own account's is_admin
scripts/
  migrate-to-supabase.js   one-time SQLite -> Supabase data migration
server/src/
  index.js             serves client/dist and nothing else
client/src/
  supabaseClient.js    the Supabase client (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY)
  gameConfig.js        non-scoring UI constants (see "Changing the scoring")
  auth.jsx             sign-up/login/logout, forgot/reset password
  api.js               all data access: catch_feed/weekly_leaderboard/alltime_leaderboard views + RPCs
  pages/               Feed, LogCatch, Leaderboard, Profile, AuthPage, ForgotPassword, ResetPassword
  components/          Layout (top bar + mobile tab bar), CatchCard
```
