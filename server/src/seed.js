// Fills the database with demo anglers and catches (no photos): `npm run seed`
import { db, transaction } from './db.js';
import { SPECIES } from './config.js';
import { computeScore } from './lib/scoring.js';

const names = ['reelmckoy', 'bassmaster_beth', 'troutbum', 'lakeside_lou', 'pike_and_pine', 'catfish_kate'];
const rand = (a, b) => a + Math.random() * (b - a);

transaction(() => {
  for (const username of names) {
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) continue;
    const { lastInsertRowid: uid } = db
      .prepare('INSERT INTO users (username) VALUES (?)')
      .run(username);
    const n = Math.floor(rand(6, 16));
    for (let i = 0; i < n; i++) {
      const sp = SPECIES[Math.floor(Math.random() * (SPECIES.length - 1))];
      const weight = Math.round(sp.typicalWeight * rand(0.4, 2.2) * 100) / 100;
      const length = Math.round(sp.typicalLength * rand(0.7, 1.5) * 10) / 10;
      const caughtAt = new Date(Date.now() - rand(0, 20) * 86_400_000).toISOString();
      const { lastInsertRowid: cid } = db
        .prepare(
          'INSERT INTO catches (user_id, species, weight_lbs, length_in, caught_at, location) VALUES (?,?,?,?,?,?)',
        )
        .run(uid, sp.name, weight, length, caughtAt, ['Lake Erie', 'Sandy Pond', 'Green River', null][i % 4]);
      const s = computeScore(sp.name, weight, length);
      db.prepare(
        'INSERT INTO scores (catch_id, user_id, points, base, weight_bonus, length_bonus, earned_at) VALUES (?,?,?,?,?,?,?)',
      ).run(cid, uid, s.total, s.base, s.weightBonus, s.lengthBonus, caughtAt);
    }
  }
});
console.log(`Seeded demo anglers: ${names.join(', ')}`);
