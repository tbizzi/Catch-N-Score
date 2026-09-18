import { BASE_POINTS, SCORING, SPECIES } from '../config.js';

const bySpecies = new Map(SPECIES.map((s) => [s.name, s]));

export function findSpecies(name) {
  return bySpecies.get(name) ?? null;
}

/** Returns { total, base, weightBonus, lengthBonus } for a catch, or null for an unknown species. */
export function computeScore(speciesName, weightLbs, lengthIn) {
  const sp = findSpecies(speciesName);
  if (!sp) return null;
  const base = BASE_POINTS[sp.rarity];
  const weightRatio = Math.min(weightLbs / sp.typicalWeight, SCORING.RATIO_CAP);
  const lengthRatio = Math.min(lengthIn / sp.typicalLength, SCORING.RATIO_CAP);
  const weightBonus = Math.round(base * SCORING.WEIGHT_FACTOR * weightRatio);
  const lengthBonus = Math.round(base * SCORING.LENGTH_FACTOR * lengthRatio);
  return { total: base + weightBonus + lengthBonus, base, weightBonus, lengthBonus };
}

/** Returns an error message if the measurements are implausible for the species, else null. */
export function checkMeasurements(speciesName, weightLbs, lengthIn) {
  const sp = findSpecies(speciesName);
  if (!sp) return 'Unknown species';
  if (!Number.isFinite(weightLbs) || weightLbs <= 0) return 'Weight must be a positive number';
  if (!Number.isFinite(lengthIn) || lengthIn <= 0) return 'Length must be a positive number';
  const max = SCORING.MAX_PLAUSIBLE_RATIO;
  if (weightLbs > sp.typicalWeight * max) return `That weight looks too high for a ${sp.name}`;
  if (lengthIn > sp.typicalLength * max) return `That length looks too long for a ${sp.name}`;
  return null;
}
