import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import './db.js';
import { attachUser, sessionRouter } from './session.js';
import { catchesRouter } from './routes/catches.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { usersRouter } from './routes/users.js';
import { CLIENT_DIST, UPLOAD_DIR } from './lib/paths.js';

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);

app.use(express.json({ limit: '100kb' }));
app.use(attachUser);

app.use(
  '/uploads',
  express.static(UPLOAD_DIR, {
    maxAge: '30d',
    immutable: true,
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  }),
);

app.use('/api/session', sessionRouter);
app.use('/api/catches', catchesRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/users', usersRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// In production, serve the built React app (with SPA fallback).
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'Photo is too large (10 MB max)' : err.message });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => console.log(`Catch N' Score API listening on http://localhost:${port}`));
