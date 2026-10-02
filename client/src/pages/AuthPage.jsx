import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function AuthPage({ mode }) {
  const isSignup = mode === 'signup';
  const { signUp, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmNotice, setConfirmNotice] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (isSignup) {
        const { needsConfirmation } = await signUp(email.trim(), password, username.trim());
        if (needsConfirmation) {
          setConfirmNotice(true);
          setBusy(false);
          return;
        }
        // Otherwise AuthProvider's onAuthStateChange already picked up the
        // new session; App.jsx swaps into the signed-in routes.
      } else {
        await signIn(identifier.trim(), password);
      }
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (confirmNotice) {
    return (
      <div className="page narrow">
        <div className="card">
          <h1>Check your email</h1>
          <p className="muted">We sent a confirmation link to {email}. Click it, then come back and log in.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page narrow">
      <form className="card form" onSubmit={submit}>
        <h1>{isSignup ? 'Join the leaderboard' : 'Welcome back'}</h1>
        <p className="muted">{isSignup ? 'Create an account to log catches and earn points.' : 'Log in to log your catches.'}</p>

        {isSignup && (
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username"
              autoCapitalize="none" autoCorrect="off" required minLength={3} maxLength={20} pattern="[A-Za-z0-9_]+"
              title="Letters, numbers and underscores" />
          </label>
        )}

        <label>
          {isSignup ? 'Email' : 'Email or username'}
          <input
            type={isSignup ? 'email' : 'text'}
            value={isSignup ? email : identifier}
            onChange={(e) => (isSignup ? setEmail(e.target.value) : setIdentifier(e.target.value))}
            autoComplete={isSignup ? 'email' : 'username'} autoCapitalize="none" autoCorrect="off" required
          />
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
          {isSignup ? (
            <>Already have an account? <Link to="/login">Log in</Link></>
          ) : (
            <>New here? <Link to="/signup">Sign up</Link> · <Link to="/forgot-password">Forgot password?</Link></>
          )}
        </p>
      </form>
    </div>
  );
}
