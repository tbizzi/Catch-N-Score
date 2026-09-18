import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function AuthPage({ mode }) {
  const isSignup = mode === 'signup';
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const dest = location.state?.from || '/';
  if (user) return <Navigate to={dest} replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await (isSignup ? signup : login)(username.trim(), password);
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <form className="card form" onSubmit={submit}>
        <h1>{isSignup ? 'Join the leaderboard' : 'Welcome back'}</h1>
        <p className="muted">{isSignup ? 'Create an account to log catches and earn points.' : 'Log in to log your catches.'}</p>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username"
            autoCapitalize="none" autoCorrect="off" required minLength={3} maxLength={20} pattern="[A-Za-z0-9_]+"
            title="Letters, numbers and underscores" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignup ? 'new-password' : 'current-password'} required minLength={isSignup ? 8 : 1} />
          {isSignup && <span className="hint">At least 8 characters</span>}
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary block" disabled={busy}>{busy ? 'One sec…' : isSignup ? 'Create account' : 'Log in'}</button>
        <p className="muted center small">
          {isSignup ? <>Already have an account? <Link to="/login" state={location.state}>Log in</Link></>
            : <>New here? <Link to="/signup" state={location.state}>Sign up</Link></>}
        </p>
      </form>
    </div>
  );
}
