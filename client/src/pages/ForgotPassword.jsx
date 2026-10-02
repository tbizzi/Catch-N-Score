import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="page narrow">
        <div className="card">
          <h1>Check your email</h1>
          <p className="muted">If an account exists for {email}, a link to reset the password was just sent to it.</p>
          <Link className="btn btn-ghost" to="/login">Back to log in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page narrow">
      <form className="card form" onSubmit={submit}>
        <h1>Reset your password</h1>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary block" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
        <p className="muted center small"><Link to="/login">Back to log in</Link></p>
      </form>
    </div>
  );
}
