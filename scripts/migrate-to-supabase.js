// One-time migration: copies the local SQLite backup's users and catches
// (and each catch's photo) into Supabase.
//
// Usage:
//   cp .env.example .env   # then fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
//   npm run migrate:supabase
//
// Safety:
//   - Never opens the real backup. It's copied to a throwaway temp directory
//     first, and only that copy is read — so SQLite's WAL replay on open
//     can't modify the original backup. The copy is deleted when the script
//     finishes (or fails).
//   - Safe to re-run: rows are upserted on a `legacy_id` column (the old
//     SQLite integer id), and photos are re-uploaded with `upsert: true`, so
//     running it twice updates the same rows/files instead of duplicating
//     them. Run supabase/schema.sql first — it defines `legacy_id`.
//
// Requires supabase/schema.sql to have already been run against the target
// Supabase project (profiles + catches tables, catch-photos bucket).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@supabase/supabase-js';

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(os.homedir(), 'Desktop', 'catchnscore-backup');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PHOTO_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Copy .env.example to .env, fill it in, then run: npm run migrate:supabase');
  process.exit(1);
}
if (!fs.existsSync(BACKUP_DIR)) {
  console.error(`Backup not found at ${BACKUP_DIR}. Set BACKUP_DIR to override.`);
  process.exit(1);
}

/** Depth-first search under `root` for a directory literally named "uploads". */
function findUploadsDir(root) {
  const direct = path.join(root, 'uploads');
  if (fs.existsSync(direct)) return direct;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === 'uploads') return full;
      stack.push(full);
    }
  }
  return null;
}

/** Depth-first search under `root` for a file with this exact basename. */
function findFile(root, filename) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === filename) return full;
    }
  }
  return null;
}

function mimeFor(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return PHOTO_MIME[ext] || 'application/octet-stream';
}

// 1. Copy the backup to a scratch directory. Only this copy is ever opened,
// so WAL replay can't touch the original.
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cns-migrate-'));
console.log(`Working on a throwaway copy: ${workDir}`);
fs.cpSync(BACKUP_DIR, workDir, { recursive: true });

try {
  const dbPath = findFile(workDir, 'catchnscore.db') ?? path.join(workDir, 'catchnscore.db');
  if (!fs.existsSync(dbPath)) throw new Error(`catchnscore.db not found under ${BACKUP_DIR}`);

  const db = new DatabaseSync(dbPath); // opens + replays WAL — on the copy only
  const users = db.prepare('SELECT id, username, created_at FROM users ORDER BY id').all();
  const catches = db
    .prepare(
      'SELECT id, user_id, species, weight_lbs, length_in, caught_at, location, photo, created_at FROM catches ORDER BY id',
    )
    .all();
  db.close();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // 2. Users -> profiles, upserted on legacy_id (idempotent).
  let profilesWritten = 0;
  const legacyToNewId = new Map();
  if (users.length) {
    const rows = users.map((u) => ({ username: u.username, legacy_id: u.id, created_at: u.created_at }));
    const { data, error } = await supabase.from('profiles').upsert(rows, { onConflict: 'legacy_id' }).select('id, legacy_id');
    if (error) throw new Error(`Writing profiles failed: ${error.message}`);
    profilesWritten = data.length;
    for (const row of data) legacyToNewId.set(row.legacy_id, row.id);
  }
  console.log(`Users: found ${users.length}, inserted/updated ${profilesWritten}.`);

  // 3. Each catch's photo -> Storage (upsert: true, so re-running overwrites
  // rather than duplicating), then catches -> table, upserted on legacy_id.
  const uploadsDir = findUploadsDir(workDir);
  let photosFound = 0;
  let photosUploaded = 0;
  const rows = [];

  for (const c of catches) {
    let photoUrl = null;
    if (c.photo) {
      photosFound++;
      const filePath = uploadsDir && findFile(uploadsDir, c.photo);
      if (!filePath) {
        console.warn(`  photo "${c.photo}" for catch ${c.id} not found under uploads/ — keeping the catch, skipping its photo`);
      } else {
        const buf = fs.readFileSync(filePath);
        const { error: upErr } = await supabase.storage
          .from('catch-photos')
          .upload(c.photo, buf, { contentType: mimeFor(c.photo), upsert: true });
        if (upErr) {
          console.warn(`  uploading photo for catch ${c.id} failed: ${upErr.message}`);
        } else {
          photosUploaded++;
          photoUrl = supabase.storage.from('catch-photos').getPublicUrl(c.photo).data.publicUrl;
        }
      }
    }

    const userId = legacyToNewId.get(c.user_id);
    if (!userId) {
      console.warn(`  catch ${c.id} references missing user ${c.user_id} — skipping`);
      continue;
    }
    rows.push({
      user_id: userId,
      species: c.species,
      weight_lbs: c.weight_lbs,
      length_in: c.length_in,
      caught_at: c.caught_at,
      location: c.location,
      photo_url: photoUrl,
      legacy_id: c.id,
      created_at: c.created_at,
    });
  }

  let catchesWritten = 0;
  if (rows.length) {
    const { data, error } = await supabase.from('catches').upsert(rows, { onConflict: 'legacy_id' }).select('id');
    if (error) throw new Error(`Writing catches failed: ${error.message}`);
    catchesWritten = data.length;
  }

  console.log(`Catches: found ${catches.length}, inserted/updated ${catchesWritten}.`);
  console.log(`Photos: found ${photosFound}, uploaded ${photosUploaded}.`);
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}
