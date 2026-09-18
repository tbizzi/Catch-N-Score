import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { useAuth } from './auth.jsx';
import Feed from './pages/Feed.jsx';
import NamePage from './pages/NamePage.jsx';
import LogCatch from './pages/LogCatch.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Profile from './pages/Profile.jsx';

function MyProfileRedirect() {
  const { user } = useAuth();
  return <Navigate to={`/u/${user.username}`} replace />;
}

export default function App() {
  const { user } = useAuth();
  if (user === undefined) return <div className="center muted">Loading…</div>;
  if (!user) return <NamePage />;

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
