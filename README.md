# 🎣 Catch N' Score

Log your catches, earn points by species, weight and length, and climb the weekly and all-time leaderboards.

**Stack:** React (Vite) · Node/Express 5 · SQLite (Node's built-in `node:sqlite`, no native modules to compile).

## Run it

Requires **Node 22.13+** (Node 24 LTS recommended).

```bash
npm install
npm run seed   # optional: demo anglers + catches
npm run dev    # API on :3001, web on http://localhost:5173
```

The dev server is exposed on your network, so you can open `http://<your-computer-ip>:5173` on your phone.

Production: `npm run build && npm start` — Express serves the built app and API together on http://localhost:3001.

Data (database and uploaded photos) lives in `server/data/`. Set `PORT`, `DATA_DIR`
and `TRUST_PROXY` (when behind a proxy) as environment variables.

## Changing the scoring

Everything is in [`server/src/config.js`](server/src/config.js): base points per rarity tier, the weight/length
bonus factors, the species list with typical sizes, the leaderboard timezone (weeks run Mon–Sun in that zone),
how far back a catch may be dated, and whether a photo is required.

After changing scoring numbers, recompute existing catches with `npm run rescore`.

## Layout

```
server/src/
  config.js        scoring + game rules (edit me)
  db.js            SQLite schema: users, catches, scores
  session.js       name-based identity (X-User-Id header, no passwords)
  routes/          catches (feed, log, delete), leaderboard, users (profile)
  lib/             scoring, week boundaries, leaderboard queries, photo storage
client/src/
  pages/           Feed, LogCatch, Leaderboard, Profile, AuthPage
  components/      Layout (top bar + mobile tab bar), CatchCard
```
