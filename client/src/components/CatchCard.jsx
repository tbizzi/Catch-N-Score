import { Link } from 'react-router-dom';
import { fmtNum, timeAgo } from '../util.js';

export function ScoreBadge({ points, big = false }) {
  return (
    <div className={`score-badge${big ? ' big' : ''}`} title="Points">
      <strong>{points.toLocaleString()}</strong>
      <span>pts</span>
    </div>
  );
}

export function Photo({ catch: c, className = '' }) {
  return c.photoUrl ? (
    <img className={`photo ${className}`} src={c.photoUrl} alt={`${c.species} caught by ${c.angler.username}`} loading="lazy" />
  ) : (
    <div className={`photo photo-empty ${className}`} aria-hidden="true">🐟</div>
  );
}

export default function CatchCard({ catch: c, showAngler = true, onDelete }) {
  const { base, weightBonus, lengthBonus } = c.score;
  return (
    <article className="card catch-card">
      <Photo catch={c} />
      <div className="catch-body">
        <div className="catch-head">
          <div>
            <h3>{c.species}</h3>
            <div className="muted small">
              {showAngler && (
                <>
                  <Link to={`/u/${c.angler.username}`} className="angler">@{c.angler.username}</Link>
                  {' · '}
                </>
              )}
              {timeAgo(c.caughtAt)}
              {c.location && <> · 📍 {c.location}</>}
            </div>
          </div>
          <ScoreBadge points={c.score.total} />
        </div>
        <div className="chips">
          <span className="chip">⚖️ {fmtNum(c.weightLbs)} lb</span>
          <span className="chip">📏 {fmtNum(c.lengthIn)} in</span>
        </div>
        <div className="breakdown small muted">
          Base {base} + weight {weightBonus} + length {lengthBonus}
        </div>
        {onDelete && (
          <button className="link-danger small" onClick={() => onDelete(c)}>Delete</button>
        )}
      </div>
    </article>
  );
}
