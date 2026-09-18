import { NavLink, Link, Outlet } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const icons = {
  feed: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  board: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  plus: 'M12 5v14M5 12h14',
  me: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  login: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
};

export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand"><span aria-hidden="true">🎣</span> Catch N' Score</Link>
          <nav className="desktop-nav">
            <NavLink to="/" end>Feed</NavLink>
            <NavLink to="/leaderboard">Leaderboards</NavLink>
            {user && <NavLink to="/me">My Profile</NavLink>}
          </nav>
          <div className="topbar-actions">
            {user ? (
              <>
                <Link to="/log" className="btn btn-accent btn-sm desktop-only">+ Log a catch</Link>
                <button className="btn btn-ghost btn-sm" onClick={logout}>Log out</button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost btn-sm">Log in</Link>
                <Link to="/signup" className="btn btn-accent btn-sm">Sign up</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="content"><Outlet /></main>

      <nav className="tabbar" aria-label="Main">
        <NavLink to="/" end><Icon d={icons.feed} /><span>Feed</span></NavLink>
        <NavLink to="/leaderboard"><Icon d={icons.board} /><span>Board</span></NavLink>
        <NavLink to="/log" className="tab-log"><Icon d={icons.plus} /><span>Log</span></NavLink>
        {user ? (
          <NavLink to="/me"><Icon d={icons.me} /><span>Me</span></NavLink>
        ) : (
          <NavLink to="/login"><Icon d={icons.login} /><span>Log in</span></NavLink>
        )}
      </nav>
    </div>
  );
}
