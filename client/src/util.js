import { LEADERBOARD_TZ } from './gameConfig.js';

function parts(date, tz) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  });
  return Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, +p.value]));
}

/** Milliseconds the timezone is ahead of UTC at the given instant. */
function offsetMs(date, tz) {
  const p = parts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Instant at which the given wall-clock time (expressed as UTC ms) occurs in tz. */
function wallToInstant(wallMs, tz) {
  let guess = wallMs - offsetMs(new Date(wallMs), tz);
  guess = wallMs - offsetMs(new Date(guess), tz); // re-check across DST boundaries
  return guess;
}

/** The Mon–Sun week containing `now`, as ISO instants [start, end) plus the timezone.
 * Ported from the old server/src/lib/weeks.js — purely for the leaderboard's
 * "Week of ..." label; the actual bucketing happens in the weekly_leaderboard
 * view (supabase/schema.sql), computed independently in Postgres. */
export function currentWeek(now = new Date(), tz = LEADERBOARD_TZ) {
  const DAY = 86_400_000;
  const p = parts(now, tz);
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(); // 0 = Sun
  const mondayWall = Date.UTC(p.year, p.month - 1, p.day) - ((dow + 6) % 7) * DAY;
  return {
    start: new Date(wallToInstant(mondayWall, tz)).toISOString(),
    end: new Date(wallToInstant(mondayWall + 7 * DAY, tz)).toISOString(),
    tz,
  };
}

export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export const fmtNum = (n) => (Number.isInteger(n) ? String(n) : String(+n.toFixed(2)));
export const fmtPoints = (n) => Number(n).toLocaleString();

/** Value for <input type="datetime-local"> in the user's local time. */
export function toLocalInput(date) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

/** Downscale a photo before upload (phone photos are huge). Falls back to the original file. */
export async function resizeImage(file, maxSide = 1600, quality = 0.85) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
