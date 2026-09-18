// ─────────────────────────────────────────────────────────────────────────────
//  CATCH N' SCORE — GAME RULES
//  Everything that affects scoring or the leaderboards lives in this file.
//  After changing scoring numbers, run `npm run rescore` to recompute the
//  points of catches that were already logged.
// ─────────────────────────────────────────────────────────────────────────────

// Base points awarded just for landing a species, by rarity/difficulty tier.
export const BASE_POINTS = {
  common: 10,
  uncommon: 25,
  rare: 50,
  trophy: 100,
};

// Score for one catch:
//
//   weightRatio  = min(weight / species.typicalWeight, RATIO_CAP)
//   lengthRatio  = min(length / species.typicalLength, RATIO_CAP)
//   score = base
//         + base * WEIGHT_FACTOR * weightRatio
//         + base * LENGTH_FACTOR * lengthRatio      (each part rounded)
//
// So a "typical" fish scores base * (1 + WEIGHT_FACTOR + LENGTH_FACTOR),
// and bigger-than-typical fish earn proportionally more, up to RATIO_CAP x typical.
export const SCORING = {
  WEIGHT_FACTOR: 0.75,
  LENGTH_FACTOR: 0.5,
  RATIO_CAP: 4,
  // Reject entries heavier/longer than this many times the typical size
  // (catches typos like 250 lbs bluegill).
  MAX_PLAUSIBLE_RATIO: 10,
};

// name, rarity tier, typical (average adult) weight in lbs and length in inches.
export const SPECIES = [
  { name: 'Bluegill', rarity: 'common', typicalWeight: 0.5, typicalLength: 7 },
  { name: 'Green Sunfish', rarity: 'common', typicalWeight: 0.3, typicalLength: 6 },
  { name: 'Pumpkinseed', rarity: 'common', typicalWeight: 0.3, typicalLength: 6 },
  { name: 'Rock Bass', rarity: 'common', typicalWeight: 0.5, typicalLength: 7 },
  { name: 'Yellow Perch', rarity: 'common', typicalWeight: 0.6, typicalLength: 9 },
  { name: 'Black Crappie', rarity: 'common', typicalWeight: 0.8, typicalLength: 10 },
  { name: 'White Crappie', rarity: 'common', typicalWeight: 0.8, typicalLength: 10 },
  { name: 'Common Carp', rarity: 'common', typicalWeight: 8, typicalLength: 24 },
  { name: 'Largemouth Bass', rarity: 'uncommon', typicalWeight: 2.5, typicalLength: 15 },
  { name: 'Smallmouth Bass', rarity: 'uncommon', typicalWeight: 2, typicalLength: 15 },
  { name: 'Spotted Bass', rarity: 'uncommon', typicalWeight: 1.5, typicalLength: 14 },
  { name: 'White Bass', rarity: 'uncommon', typicalWeight: 1, typicalLength: 12 },
  { name: 'Channel Catfish', rarity: 'uncommon', typicalWeight: 4, typicalLength: 22 },
  { name: 'Rainbow Trout', rarity: 'uncommon', typicalWeight: 2, typicalLength: 16 },
  { name: 'Brook Trout', rarity: 'uncommon', typicalWeight: 1, typicalLength: 12 },
  { name: 'Brown Trout', rarity: 'uncommon', typicalWeight: 2.5, typicalLength: 17 },
  { name: 'Redfish', rarity: 'uncommon', typicalWeight: 6, typicalLength: 26 },
  { name: 'Speckled Trout', rarity: 'uncommon', typicalWeight: 2, typicalLength: 17 },
  { name: 'Flounder', rarity: 'uncommon', typicalWeight: 2, typicalLength: 16 },
  { name: 'Walleye', rarity: 'rare', typicalWeight: 3, typicalLength: 20 },
  { name: 'Northern Pike', rarity: 'rare', typicalWeight: 5, typicalLength: 28 },
  { name: 'Striped Bass', rarity: 'rare', typicalWeight: 10, typicalLength: 30 },
  { name: 'Blue Catfish', rarity: 'rare', typicalWeight: 15, typicalLength: 32 },
  { name: 'Flathead Catfish', rarity: 'rare', typicalWeight: 15, typicalLength: 32 },
  { name: 'Lake Trout', rarity: 'rare', typicalWeight: 8, typicalLength: 26 },
  { name: 'Coho Salmon', rarity: 'rare', typicalWeight: 8, typicalLength: 26 },
  { name: 'Snook', rarity: 'rare', typicalWeight: 8, typicalLength: 28 },
  { name: 'Chinook Salmon', rarity: 'trophy', typicalWeight: 20, typicalLength: 36 },
  { name: 'Muskellunge', rarity: 'trophy', typicalWeight: 15, typicalLength: 40 },
  { name: 'Sturgeon', rarity: 'trophy', typicalWeight: 40, typicalLength: 55 },
  { name: 'Tarpon', rarity: 'trophy', typicalWeight: 60, typicalLength: 60 },
  // Fallback for anything not listed above.
  { name: 'Other', rarity: 'common', typicalWeight: 2, typicalLength: 12 },
];

// ── Leaderboards ─────────────────────────────────────────────────────────────
// Weeks run Monday 00:00 → Sunday 23:59:59 in this IANA timezone.
export const LEADERBOARD_TZ = 'America/New_York';
export const LEADERBOARD_LIMIT = 100;

// ── Catch logging ────────────────────────────────────────────────────────────
export const REQUIRE_PHOTO = false;
// How far in the past a catch's date/time may be (keeps weekly boards honest).
export const MAX_BACKDATE_DAYS = 7;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
