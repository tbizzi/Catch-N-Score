import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { useAuth } from './auth.jsx';
import Feed from './pages/Feed.jsx';
import AuthPage from './pages/AuthPage.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import LogCatch from './pages/LogCatch.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Profile from './pages/Profile.jsx';

function MyProfileRedirect() {
  const { user } = useAuth();
  return <Navigate to={`/u/${user.username}`} replace />;
}

export default function App() {
  const { user, recovering } = useAuth();

  if (user === undefined) return <div className="center muted">Loading…</div>;

  // Opening a "forgot password" email link signs the browser into a
  // temporary recovery session, which would otherwise look like a normal
  // sign-in below — always show the reset form instead until it's done.
  if (recovering) return <ResetPassword />;

  if (!user) {
    return (
      <Routes>
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="*" element={<AuthPage mode="login" />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Feed />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="u/:username" element={<Profile />} />
        <Route path="log" element={<LogCatch />} />
        <Route path="me" element={<MyProfileRedirect />} />
        <Route path="*" element={<div className="center muted">Nothing here — the fish got away.</div>} />
      </Route>
    </Routes>
  );
}
