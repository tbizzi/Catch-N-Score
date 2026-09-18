import { db } from '../db.js';

const SELECT = `
  SELECT c.id, c.user_id, c.species, c.weight_lbs, c.length_in, c.caught_at, c.location, c.photo, c.created_at,
         u.username, s.points, s.base, s.weight_bonus, s.length_bonus
  FROM catches c
  JOIN users u  ON u.id = c.user_id
  JOIN scores s ON s.catch_id = c.id
`;

export function toCatch(r) {
  return {
    id: r.id,
    species: r.species,
    weightLbs: r.weight_lbs,
    lengthIn: r.length_in,
    caughtAt: r.caught_at,
    location: r.location,
    photoUrl: r.photo ? `/uploads/${r.photo}` : null,
    score: { total: r.points, base: r.base, weightBonus: r.weight_bonus, lengthBonus: r.length_bonus },
    angler: { id: r.user_id, username: r.username },
  };
}

/** Newest-logged first. `before` is a catch id cursor. */
export function listCatches({ userId = null, before = null, limit = 20 } = {}) {
  const where = [];
  const args = [];
  if (userId != null) (where.push('c.user_id = ?'), args.push(userId));
  if (before != null) (where.push('c.id < ?'), args.push(before));
  const sql = `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.id DESC LIMIT ?`;
  return db.prepare(sql).all(...args, limit).map(toCatch);
}

export function getCatch(id) {
  const r = db.prepare(`${SELECT} WHERE c.id = ?`).get(id);
  return r ? toCatch(r) : null;
}

/** A user's best catches by weight, length and score. */
export function personalBests(userId) {
  const best = (orderBy) => {
    const r = db.prepare(`${SELECT} WHERE c.user_id = ? ORDER BY ${orderBy} LIMIT 1`).get(userId);
    return r ? toCatch(r) : null;
  };
  return {
    heaviest: best('c.weight_lbs DESC, c.id DESC'),
    longest: best('c.length_in DESC, c.id DESC'),
    highestScore: best('s.points DESC, c.id DESC'),
  };
}
