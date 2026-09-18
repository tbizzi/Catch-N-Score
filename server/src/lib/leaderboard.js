import { db } from '../db.js';

import { currentWeek } from './weeks.js';

/** Standard competition ranking: equal points share a rank (1, 2, 2, 4). */
function withRanks(rows) {
  let rank = 0;
  return rows.map((r, i) => {
    if (i === 0 || r.points !== rows[i - 1].points) rank = i + 1;
    return { rank, userId: r.user_id, username: r.username, points: r.points, catches: r.catches };
  });
}

function query(range) {
  const where = range ? 'WHERE s.earned_at >= ? AND s.earned_at < ?' : '';
  const args = range ? [range.start, range.end] : [];
  const rows = db
    .prepare(
      `SELECT s.user_id, u.username, SUM(s.points) AS points, COUNT(*) AS catches
       FROM scores s JOIN users u ON u.id = s.user_id
       ${where}
       GROUP BY s.user_id
       ORDER BY points DESC, catches ASC, u.username COLLATE NOCASE ASC`,
    )
    .all(...args);
  return withRanks(rows);
}

export function weeklyLeaderboard(now = new Date()) {
  const week = currentWeek(now);
  return { week, rows: query(week) };
}

export function allTimeLeaderboard() {
  return { rows: query(null) };
}

