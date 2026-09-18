import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { useAuth } from './auth.jsx';
import Feed from './pages/Feed.jsx';
import AuthPage from './pages/AuthPage.jsx';
import LogCatch from './pages/LogCatch.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Profile from './pages/Profile.jsx';

function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) return <div className="center muted">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

function MyProfileRedirect() {
  const { user } = useAuth();
  return <Navigate to={`/u/${user.username}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Feed />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="u/:username" element={<Profile />} />
        <Route path="log" element={<RequireAuth><LogCatch /></RequireAuth>} />
        <Route path="me" element={<RequireAuth><MyProfileRedirect /></RequireAuth>} />
        <Route path="login" element={<AuthPage mode="login" />} />
        <Route path="signup" element={<AuthPage mode="signup" />} />
        <Route path="*" element={<div className="center muted">Nothing here — the fish got away.</div>} />
      </Route>
    </Routes>
  );
}
