import { Router } from 'express';
import { LEADERBOARD_LIMIT } from '../config.js';
import { allTimeLeaderboard, weeklyLeaderboard } from '../lib/leaderboard.js';

export const leaderboardRouter = Router();

/** Top N rows, plus the signed-in user's own row if they fall outside the top N. */
function respond(req, res, { rows, week }) {
  const me = req.user ? rows.find((r) => r.userId === req.user.id) ?? null : null;
  res.json({ week: week ?? null, rows: rows.slice(0, LEADERBOARD_LIMIT), me });
}

leaderboardRouter.get('/weekly', (req, res) => respond(req, res, weeklyLeaderboard()));
leaderboardRouter.get('/alltime', (req, res) => respond(req, res, allTimeLeaderboard()));
