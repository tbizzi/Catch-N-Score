import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import CatchCard, { Photo } from '../components/CatchCard.jsx';
import { fmtNum, fmtPoints } from '../util.js';

function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function Best({ title, c, metric }) {
  if (!c) return null;
  return (
    <div className="card best">
      <Photo catch={c} className="best-photo" />
      <div>
        <div className="muted small">{title}</div>
        <strong className="best-metric">{metric}</strong>
        <div className="small">{c.species}</div>
      </div>
    </div>
  );
}

export default function Profile() {
  const { username } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('grid');

  const load = useCallback(() => {
    setError('');
    api.profile(username).then(setData).catch((e) => { setData(null); setError(e.message); });
  }, [username]);
  useEffect(() => { setData(null); load(); }, [load]);

  async function remove(c) {
    if (!window.confirm(`Delete this ${c.species}? Its points will be removed.`)) return;
    try {
      await api.deleteCatch(c.id);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!data) return <div className="center muted">Loading…</div>;

  const { stats, personalBests: pb, catches } = data;
  const isMe = user?.id === data.user.id;

  return (
    <div className="page">
      <section className="card profile-head">
        <div className="avatar" aria-hidden="true">{data.user.username[0].toUpperCase()}</div>
        <div>
          <h1>@{data.user.username}</h1>
          <p className="muted small">Angling since {new Date(data.user.joinedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
        </div>
        {isMe && <Link to="/log" className="btn btn-accent btn-sm push">+ Log</Link>}
      </section>

      <section className="stats">
        <Stat label="Lifetime score" value={fmtPoints(stats.lifetimeScore)} sub={stats.lifetimeRank && `Rank #${stats.lifetimeRank}`} />
        <Stat label="This week" value={fmtPoints(stats.weeklyScore)} sub={stats.weeklyRank ? `Rank #${stats.weeklyRank}` : 'No catches yet'} />
        <Stat label="Catches" value={stats.totalCatches} />
        <Stat label="Species" value={stats.speciesCount} />
      </section>

      {catches.length > 0 && (
        <>
          <h2>Personal bests</h2>
          <section className="bests">
            <Best title="🐋 Biggest fish" c={pb.heaviest} metric={`${fmtNum(pb.heaviest.weightLbs)} lb`} />
            <Best title="📏 Longest fish" c={pb.longest} metric={`${fmtNum(pb.longest.lengthIn)} in`} />
            <Best title="⭐ Best score" c={pb.highestScore} metric={`${fmtPoints(pb.highestScore.score.total)} pts`} />
          </section>
        </>
      )}

      <div className="section-head">
        <h2>Catches</h2>
        {catches.length > 0 && (
          <div className="segmented small-seg">
            <button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')}>Grid</button>
            <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>List</button>
          </div>
        )}
      </div>

      {catches.length === 0 && (
        <div className="card empty">
          <div className="empty-emoji">🎣</div>
          <p>{isMe ? "You haven't logged a catch yet." : 'No catches logged yet.'}</p>
          {isMe && <Link to="/log" className="btn btn-primary">Log your first catch</Link>}
        </div>
      )}

      {view === 'grid' ? (
        <div className="grid-tiles">
          {catches.map((c) => (
            <button key={c.id} className="tile" onClick={() => setView('list')} title={c.species}>
              <Photo catch={c} className="tile-photo" />
              <span className="tile-score">{c.score.total}</span>
              <span className="tile-label">{c.species}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="stack">
          {catches.map((c) => <CatchCard key={c.id} catch={c} showAngler={false} onDelete={isMe ? remove : undefined} />)}
        </div>
      )}
    </div>
  );
}
