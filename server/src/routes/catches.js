import { Router } from 'express';
import multer from 'multer';
import { db, transaction } from '../db.js';
import { requireAuth } from '../session.js';
import { MAX_BACKDATE_DAYS, MAX_PHOTO_BYTES, REQUIRE_PHOTO, SPECIES, BASE_POINTS, SCORING } from '../config.js';
import { checkMeasurements, computeScore } from '../lib/scoring.js';
import { getCatch, listCatches } from '../lib/catches.js';
import { deletePhoto, savePhoto } from '../lib/photos.js';

export const catchesRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } });

const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;

/** Public scoring rules, so the client can show species and a live score preview. */
catchesRouter.get('/species', (_req, res) => {
  res.json({
    species: SPECIES.map((s) => ({ ...s, basePoints: BASE_POINTS[s.rarity] })),
    scoring: SCORING,
    requirePhoto: REQUIRE_PHOTO,
    maxBackdateDays: MAX_BACKDATE_DAYS,
  });
});

catchesRouter.get('/preview', (req, res) => {
  const { species } = req.query;
  const weight = Number(req.query.weight);
  const length = Number(req.query.length);
  const problem = checkMeasurements(species, weight, length);
  if (problem) return res.status(400).json({ error: problem });
  res.json({ score: computeScore(species, weight, length) });
});

// Global feed
catchesRouter.get('/', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
  const before = parseInt(req.query.before, 10) || null;
  const catches = listCatches({ before, limit });
  res.json({ catches, nextCursor: catches.length === limit ? catches[catches.length - 1].id : null });
});

catchesRouter.get('/:id', (req, res) => {
  const c = getCatch(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Catch not found' });
  res.json({ catch: c });
});

catchesRouter.post('/', requireAuth, upload.single('photo'), (req, res) => {
  const species = String(req.body.species ?? '');
  const weight = round(Number(req.body.weightLbs), 2);
  const length = round(Number(req.body.lengthIn), 1);
  const location = String(req.body.location ?? '').trim().slice(0, 100) || null;

  const problem = checkMeasurements(species, weight, length);
  if (problem) return res.status(400).json({ error: problem });

  const caught = new Date(req.body.caughtAt);
  if (Number.isNaN(caught.getTime())) return res.status(400).json({ error: 'Invalid date/time' });
  const now = Date.now();
  if (caught.getTime() > now + 5 * 60_000) return res.status(400).json({ error: "Catch date can't be in the future" });
  if (caught.getTime() < now - MAX_BACKDATE_DAYS * 86_400_000) {
    return res.status(400).json({ error: `Catches can only be logged up to ${MAX_BACKDATE_DAYS} days back` });
  }
  const caughtAt = caught.toISOString();

  if (!req.file && REQUIRE_PHOTO) return res.status(400).json({ error: 'A photo is required' });
  let photo = null;
  if (req.file) {
    photo = savePhoto(req.file.buffer);
    if (!photo) return res.status(400).json({ error: 'Photo must be a JPEG, PNG, WebP or GIF image' });
  }

  const score = computeScore(species, weight, length);
  try {
    const id = transaction(() => {
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO catches (user_id, species, weight_lbs, length_in, caught_at, location, photo)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(req.user.id, species, weight, length, caughtAt, location, photo);
      db.prepare(
        `INSERT INTO scores (catch_id, user_id, points, base, weight_bonus, length_bonus, earned_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(lastInsertRowid, req.user.id, score.total, score.base, score.weightBonus, score.lengthBonus, caughtAt);
      return Number(lastInsertRowid);
    });
    res.status(201).json({ catch: getCatch(id) });
  } catch (err) {
    deletePhoto(photo);
    throw err;
  }
});

catchesRouter.delete('/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT user_id, photo FROM catches WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Catch not found' });
  if (row.user_id !== req.user.id) return res.status(403).json({ error: "You can't delete someone else's catch" });
  db.prepare('DELETE FROM catches WHERE id = ?').run(Number(req.params.id)); // scores row cascades
  deletePhoto(row.photo);
  res.json({ ok: true });
});
