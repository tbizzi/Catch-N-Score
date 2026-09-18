// Recomputes every stored score using the current formula in config.js.
import { db, transaction } from './db.js';
import { computeScore } from './lib/scoring.js';

const catches = db.prepare('SELECT id, species, weight_lbs, length_in FROM catches').all();
const update = db.prepare(
  'UPDATE scores SET points = ?, base = ?, weight_bonus = ?, length_bonus = ? WHERE catch_id = ?',
);

transaction(() => {
  for (const c of catches) {
    const s = computeScore(c.species, c.weight_lbs, c.length_in);
    if (s) update.run(s.total, s.base, s.weightBonus, s.lengthBonus, c.id);
  }
});
console.log(`Rescored ${catches.length} catches.`);
