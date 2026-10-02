// Non-scoring game rules that used to live in server/src/config.js. There's
// no server anymore, so these are UX-only (date picker bounds, the "photo
// required" label, the leaderboard week label) — the real boundary for
// backdating is enforced by the trg_catches_validate trigger in
// supabase/schema.sql, and must be changed in both places together.
export const REQUIRE_PHOTO = false;
export const MAX_BACKDATE_DAYS = 7;
export const LEADERBOARD_TZ = 'America/New_York';
