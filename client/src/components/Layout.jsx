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
};

export default function Layout() {
  const { user, switchUser } = useAuth();
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand"><span aria-hidden="true">🎣</span> Catch N' Score</Link>
          <nav className="desktop-nav">
            <NavLink to="/" end>Feed</NavLink>
            <NavLink to="/leaderboard">Leaderboards</NavLink>
            <NavLink to="/me">My Profile</NavLink>
          </nav>
          <div className="topbar-actions">
            <Link to="/log" className="btn btn-accent btn-sm desktop-only">+ Log a catch</Link>
            <button className="btn btn-ghost btn-sm" onClick={switchUser}>Not {user.username}?</button>
          </div>
        </div>
      </header>

      <main className="content"><Outlet /></main>

      <nav className="tabbar" aria-label="Main">
        <NavLink to="/" end><Icon d={icons.feed} /><span>Feed</span></NavLink>
        <NavLink to="/leaderboard"><Icon d={icons.board} /><span>Board</span></NavLink>
        <NavLink to="/log" className="tab-log"><Icon d={icons.plus} /><span>Log</span></NavLink>
        <NavLink to="/me"><Icon d={icons.me} /><span>Me</span></NavLink>
      </nav>
    </div>
  );
}
