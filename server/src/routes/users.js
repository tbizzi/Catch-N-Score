import { Router } from 'express';
import { db } from '../db.js';
import { listCatches, personalBests } from '../lib/catches.js';
import { allTimeLeaderboard, weeklyLeaderboard } from '../lib/leaderboard.js';

export const usersRouter = Router();

usersRouter.get('/:username', (req, res) => {
  const user = db
    .prepare('SELECT id, username, created_at FROM users WHERE username = ?')
    .get(String(req.params.username));
  if (!user) return res.status(404).json({ error: 'Angler not found' });

  const weekly = weeklyLeaderboard();
  const allTime = allTimeLeaderboard();
  const wRow = weekly.rows.find((r) => r.userId === user.id);
  const aRow = allTime.rows.find((r) => r.userId === user.id);

  const totals = db
    .prepare('SELECT COUNT(*) AS catches, COUNT(DISTINCT species) AS species FROM catches WHERE user_id = ?')
    .get(user.id);

  res.json({
    user: { id: user.id, username: user.username, joinedAt: user.created_at },
    stats: {
      lifetimeScore: aRow?.points ?? 0,
      lifetimeRank: aRow?.rank ?? null,
      weeklyScore: wRow?.points ?? 0,
      weeklyRank: wRow?.rank ?? null,
      weeklyCatches: wRow?.catches ?? 0,
      totalCatches: totals.catches,
      speciesCount: totals.species,
    },
    personalBests: personalBests(user.id),
    catches: listCatches({ userId: user.id, limit: 200 }),
  });
});
