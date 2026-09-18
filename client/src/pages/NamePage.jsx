import { useState } from 'react';
import { useAuth } from '../auth.jsx';

export default function NamePage() {
  const { enterName } = useAuth();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await enterName(name.trim());
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <form className="card form" onSubmit={submit}>
        <h1>🎣 Catch N' Score</h1>
        <p className="muted">Enter your name to log catches and climb the leaderboard. Use the same name on any device to pick up where you left off.</p>
        <label>
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" autoCapitalize="none"
            autoCorrect="off" required minLength={3} maxLength={20} pattern="[A-Za-z0-9_]+"
            title="Letters, numbers and underscores" />
          <span className="hint">3–20 letters, numbers or underscores</span>
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary block" disabled={busy}>{busy ? 'One sec…' : "Let's fish"}</button>
      </form>
    </div>
  );
}
