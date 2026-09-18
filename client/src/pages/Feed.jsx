import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import CatchCard from '../components/CatchCard.jsx';
import { useAuth } from '../auth.jsx';

export default function Feed() {
  const { user } = useAuth();
  const [catches, setCatches] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (before) => {
    setLoading(true);
    setError('');
    try {
      const r = await api.feed(before);
      setCatches((prev) => (before ? [...prev, ...r.catches] : r.catches));
      setCursor(r.nextCursor);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(null); }, [load]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Recent catches</h1>
        <p className="muted">What everyone's reeling in right now.</p>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="stack">
        {catches.map((c) => <CatchCard key={c.id} catch={c} />)}
      </div>
      {!loading && !error && catches.length === 0 && (
        <div className="card empty">
          <div className="empty-emoji">🎣</div>
          <p>No catches yet. Be the first on the board!</p>
          <Link className="btn btn-primary" to={user ? '/log' : '/signup'}>{user ? 'Log a catch' : 'Sign up'}</Link>
        </div>
      )}
      {loading && <p className="center muted">Loading…</p>}
      {!loading && cursor && (
        <button className="btn btn-ghost block" onClick={() => load(cursor)}>Load more</button>
      )}
    </div>
  );
}
