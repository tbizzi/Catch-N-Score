import { LEADERBOARD_TZ } from '../config.js';

const DAY = 86_400_000;

function parts(date, tz) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
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

/** The Mon–Sun week containing `now`, as ISO instants [start, end) plus the timezone. */
export function currentWeek(now = new Date(), tz = LEADERBOARD_TZ) {
  const p = parts(now, tz);
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(); // 0 = Sun
  const mondayWall = Date.UTC(p.year, p.month - 1, p.day) - ((dow + 6) % 7) * DAY;
  return {
    start: new Date(wallToInstant(mondayWall, tz)).toISOString(),
    end: new Date(wallToInstant(mondayWall + 7 * DAY, tz)).toISOString(),
    tz,
  };
}
