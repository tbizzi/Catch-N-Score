import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { db } from './db.js';

// Identity is name-based and passwordless: the client stores its user id and sends it in
// the X-User-Id header. Anyone who knows (or guesses) an id can act as that user.

/** Middleware: sets req.user from the X-User-Id header, if it names an existing user. */
export function attachUser(req, _res, next) {
  const id = Number(req.get('x-user-id'));
  req.user = Number.isInteger(id) && id > 0
    ? db.prepare('SELECT id, username FROM users WHERE id = ?').get(id) ?? null
    : null;
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please enter your name first' });
  next();
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts, try again in a few minutes' },
});

export const sessionRouter = Router();

/** Create the user for this name, or return the existing one (case-insensitive). */
sessionRouter.post('/', limiter, (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) {
    return res.status(400).json({ error: 'Name must be 3–20 letters, numbers or underscores' });
  }
  let user = db.prepare('SELECT id, username FROM users WHERE username = ?').get(name);
  if (!user) {
    const { lastInsertRowid } = db.prepare('INSERT INTO users (username) VALUES (?)').run(name);
    user = { id: Number(lastInsertRowid), username: name };
  }
  res.json({ user: { id: user.id, username: user.username } });
});

/** Validates the stored id: returns the user, or null if it no longer exists. */
sessionRouter.get('/', (req, res) => {
  res.json({ user: req.user ? { id: req.user.id, username: req.user.username } : null });
});
