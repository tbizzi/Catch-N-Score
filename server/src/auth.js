import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { db } from './db.js';
import { DATA_DIR } from './lib/paths.js';

const COOKIE = 'cns_token';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// JWT secret: env var, or a random one generated once and kept next to the database.
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(DATA_DIR, 'jwt-secret');
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(file, 'utf8');
}
const SECRET = loadSecret();

// Compared against when a username doesn't exist, so login timing doesn't reveal valid usernames.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.COOKIE_SECURE === 'true',
  maxAge: MAX_AGE_MS,
  path: '/',
});

const publicUser = (u) => ({ id: u.id, username: u.username });

/** Middleware: sets req.user from the auth cookie, if valid. */
export function attachUser(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (token) {
    try {
      const { sub } = jwt.verify(token, SECRET);
      req.user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(sub) ?? null;
    } catch {
      req.user = null;
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in' });
  next();
}

function startSession(res, user) {
  const token = jwt.sign({ sub: user.id }, SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE, token, cookieOptions());
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts, try again in a few minutes' },
});

export const authRouter = Router();

authRouter.post('/signup', limiter, (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3–20 letters, numbers or underscores' });
  }
  if (password.length < 8 || Buffer.byteLength(password) > 72) {
    return res.status(400).json({ error: 'Password must be 8–72 characters' });
  }
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
    return res.status(409).json({ error: 'That username is taken' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const { lastInsertRowid } = db
    .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run(username, hash);
  const user = { id: Number(lastInsertRowid), username };
  startSession(res, user);
  res.status(201).json({ user: publicUser(user) });
});

authRouter.post('/login', limiter, (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  const row = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username);
  const ok = bcrypt.compareSync(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) return res.status(401).json({ error: 'Wrong username or password' });
  startSession(res, row);
  res.json({ user: publicUser(row) });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});
