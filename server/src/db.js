import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR } from './lib/paths.js';

export const db = new DatabaseSync(path.join(DATA_DIR, 'catchnscore.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS catches (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    species    TEXT NOT NULL,
    weight_lbs REAL NOT NULL,
    length_in  REAL NOT NULL,
    caught_at  TEXT NOT NULL,            -- ISO-8601 UTC
    location   TEXT,
    photo      TEXT,                     -- filename inside the uploads dir
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  -- One row per catch: the points it earned and how they were computed.
  -- Leaderboards sum this table; earned_at mirrors catches.caught_at.
  CREATE TABLE IF NOT EXISTS scores (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    catch_id     INTEGER NOT NULL UNIQUE REFERENCES catches(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points       INTEGER NOT NULL,
    base         INTEGER NOT NULL,
    weight_bonus INTEGER NOT NULL,
    length_bonus INTEGER NOT NULL,
    earned_at    TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_catches_user   ON catches(user_id, id DESC);
  CREATE INDEX IF NOT EXISTS idx_scores_earned  ON scores(earned_at);
  CREATE INDEX IF NOT EXISTS idx_scores_user    ON scores(user_id);
`);

/** Run fn inside a transaction; rolls back if it throws. */
export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
