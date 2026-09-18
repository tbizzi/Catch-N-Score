import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { fmtPoints } from '../util.js';

const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };

function weekLabel(week) {
  const fmt = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: week.tz });
  return `${fmt(new Date(week.start))} – ${fmt(new Date(new Date(week.end) - 1))}`;
}

function Row({ row, isMe }) {
  return (
    <li className={`lb-row${isMe ? ' me' : ''}`}>
      <span className="lb-rank">{medals[row.rank] ?? row.rank}</span>
      <Link to={`/u/${row.username}`} className="lb-name">@{row.username}</Link>
      <span className="lb-catches muted small">{row.catches} {row.catches === 1 ? 'catch' : 'catches'}</span>
      <strong className="lb-points">{fmtPoints(row.points)}</strong>
    </li>
  );
}

export default function Leaderboard() {
  const { user } = useAuth();
  const [kind, setKind] = useState('weekly');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError('');
    api.leaderboard(kind).then((r) => !cancelled && setData(r)).catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [kind]);

  const meOutside = data?.me && !data.rows.some((r) => r.userId === data.me.userId);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Leaderboards</h1>
        <p className="muted">
          {kind === 'weekly' && data?.week
            ? `Week of ${weekLabel(data.week)} · resets Monday`
            : kind === 'weekly' ? 'Resets every Monday' : 'Every catch, ever.'}
        </p>
      </div>

      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={kind === 'weekly'} className={kind === 'weekly' ? 'active' : ''} onClick={() => setKind('weekly')}>This week</button>
        <button role="tab" aria-selected={kind === 'alltime'} className={kind === 'alltime' ? 'active' : ''} onClick={() => setKind('alltime')}>All-time</button>
      </div>

      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="center muted">Loading…</p>}
      {data && data.rows.length === 0 && (
        <div className="card empty">
          <div className="empty-emoji">🏆</div>
          <p>{kind === 'weekly' ? 'No catches this week yet — get out there!' : 'No catches logged yet.'}</p>
        </div>
      )}
      {data && data.rows.length > 0 && (
        <ol className="card lb-list">
          {data.rows.map((r) => <Row key={r.userId} row={r} isMe={r.userId === user?.id} />)}
          {meOutside && <><li className="lb-gap muted">⋯</li><Row row={data.me} isMe /></>}
        </ol>
      )}
    </div>
  );
}
