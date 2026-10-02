import { supabase } from './supabaseClient.js';
import { currentWeek } from './util.js';

const PHOTO_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const FEED_PAGE_SIZE = 12;

function raise(error) {
  if (error) throw new Error(error.message);
}

/** catch_feed row -> the shape every page/component already expects. */
function mapCatchRow(r) {
  return {
    id: r.id,
    species: r.species,
    weightLbs: r.weight_lbs,
    lengthIn: r.length_in,
    caughtAt: r.caught_at,
    location: r.location,
    photoUrl: r.photo_url,
    score: { total: r.points, base: r.base, weightBonus: r.weight_bonus, lengthBonus: r.length_bonus },
    angler: { id: r.user_id, username: r.username },
  };
}

/** A photo's public URL -> its path inside the catch-photos bucket, for deletion. */
function pathFromPhotoUrl(url) {
  const marker = '/catch-photos/';
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}

async function orderedLeaderboard(view) {
  return supabase
    .from(view)
    .select('rank, user_id, username, points, catches')
    // The view's own ORDER BY isn't guaranteed to survive a query against it,
    // so the tiebreak (points desc, catches asc, name asc) is repeated here.
    .order('points', { ascending: false })
    .order('catches', { ascending: true })
    .order('username', { ascending: true });
}

export const api = {
  /** Public scoring rules, so the client can show species and a live score preview. */
  async rules() {
    const { data, error } = await supabase
      .from('species')
      .select('name, rarity, typical_weight, typical_length, base_points')
      .order('base_points');
    raise(error);
    return {
      species: data.map((s) => ({
        name: s.name, rarity: s.rarity, typicalWeight: s.typical_weight,
        typicalLength: s.typical_length, basePoints: s.base_points,
      })),
      requirePhoto: false,
      maxBackdateDays: 7,
    };
  },

  async preview(species, weight, length) {
    const { data, error } = await supabase.rpc('preview_score', {
      p_species: species, p_weight: weight, p_length: length,
    });
    raise(error);
    const row = data?.[0];
    return { score: { total: row.total, base: row.base, weightBonus: row.weight_bonus, lengthBonus: row.length_bonus } };
  },

  async feed(before) {
    let q = supabase.from('catch_feed').select('*').order('id', { ascending: false }).limit(FEED_PAGE_SIZE);
    if (before) q = q.lt('id', before);
    const { data, error } = await q;
    raise(error);
    const catches = data.map(mapCatchRow);
    return { catches, nextCursor: catches.length === FEED_PAGE_SIZE ? catches[catches.length - 1].id : null };
  },

  /** `fields`: { species, weightLbs, lengthIn, caughtAt, location, photo }. */
  async logCatch(fields, userId) {
    let photoUrl = null;
    let photoPath = null;
    if (fields.photo) {
      const ext = PHOTO_EXT[fields.photo.type] || 'jpg';
      photoPath = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('catch-photos').upload(photoPath, fields.photo, {
        contentType: fields.photo.type || 'image/jpeg',
      });
      raise(error);
      photoUrl = supabase.storage.from('catch-photos').getPublicUrl(photoPath).data.publicUrl;
    }

    try {
      const { data: inserted, error } = await supabase
        .from('catches')
        .insert({
          user_id: userId,
          species: fields.species,
          weight_lbs: fields.weightLbs,
          length_in: fields.lengthIn,
          caught_at: fields.caughtAt,
          location: fields.location || null,
          photo_url: photoUrl,
        })
        .select('id')
        .single();
      raise(error);

      const { data: row, error: feedError } = await supabase.from('catch_feed').select('*').eq('id', inserted.id).single();
      raise(feedError);
      return { catch: mapCatchRow(row) };
    } catch (err) {
      if (photoPath) await supabase.storage.from('catch-photos').remove([photoPath]);
      throw err;
    }
  },

  async deleteCatch(id) {
    const { data, error } = await supabase.from('catches').delete().eq('id', id).select('photo_url').maybeSingle();
    raise(error);
    if (!data) throw new Error("You can't delete someone else's catch");
    if (data.photo_url) {
      const path = pathFromPhotoUrl(data.photo_url);
      if (path) await supabase.storage.from('catch-photos').remove([path]);
    }
  },

  /** `kind`: 'weekly' | 'alltime'. `myId`: the caller's own profile id, so
   * their row can be included even if it falls outside the top 100. */
  async leaderboard(kind, myId) {
    const view = kind === 'weekly' ? 'weekly_leaderboard' : 'alltime_leaderboard';
    const { data, error } = await (await orderedLeaderboard(view)).limit(100);
    raise(error);
    const rows = data.map((r) => ({ rank: r.rank, userId: r.user_id, username: r.username, points: r.points, catches: r.catches }));

    let me = null;
    if (myId) {
      const { data: mine } = await supabase.from(view).select('rank, user_id, username, points, catches').eq('user_id', myId).maybeSingle();
      if (mine) me = { rank: mine.rank, userId: mine.user_id, username: mine.username, points: mine.points, catches: mine.catches };
    }
    return { week: kind === 'weekly' ? currentWeek() : null, rows, me };
  },

  async profile(username) {
    const { data: user, error } = await supabase.from('profiles').select('id, username, created_at').eq('username', username).maybeSingle();
    raise(error);
    if (!user) throw new Error('Angler not found');

    const [weekly, allTime, totalsRes, heaviest, longest, highestScore, catchesRes] = await Promise.all([
      supabase.from('weekly_leaderboard').select('rank, points, catches').eq('user_id', user.id).maybeSingle(),
      supabase.from('alltime_leaderboard').select('rank, points').eq('user_id', user.id).maybeSingle(),
      supabase.rpc('profile_totals', { p_user_id: user.id }),
      supabase.from('catch_feed').select('*').eq('user_id', user.id).order('weight_lbs', { ascending: false }).order('id', { ascending: false }).limit(1),
      supabase.from('catch_feed').select('*').eq('user_id', user.id).order('length_in', { ascending: false }).order('id', { ascending: false }).limit(1),
      supabase.from('catch_feed').select('*').eq('user_id', user.id).order('points', { ascending: false }).order('id', { ascending: false }).limit(1),
      supabase.from('catch_feed').select('*').eq('user_id', user.id).order('id', { ascending: false }).limit(200),
    ]);
    raise(totalsRes.error);
    raise(heaviest.error); raise(longest.error); raise(highestScore.error); raise(catchesRes.error);

    const totals = totalsRes.data?.[0] ?? { catches: 0, species: 0 };

    return {
      user: { id: user.id, username: user.username, joinedAt: user.created_at },
      stats: {
        lifetimeScore: allTime.data?.points ?? 0,
        lifetimeRank: allTime.data?.rank ?? null,
        weeklyScore: weekly.data?.points ?? 0,
        weeklyRank: weekly.data?.rank ?? null,
        weeklyCatches: weekly.data?.catches ?? 0,
        totalCatches: totals.catches,
        speciesCount: totals.species,
      },
      personalBests: {
        heaviest: heaviest.data[0] ? mapCatchRow(heaviest.data[0]) : null,
        longest: longest.data[0] ? mapCatchRow(longest.data[0]) : null,
        highestScore: highestScore.data[0] ? mapCatchRow(highestScore.data[0]) : null,
      },
      catches: catchesRes.data.map(mapCatchRow),
    };
  },
};
