import { createContext, useContext, useEffect, useState } from 'react';
import { api, USER_KEY } from './api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const store = {
  get: () => { try { return localStorage.getItem(USER_KEY); } catch { return null; } },
  set: (id) => { try { localStorage.setItem(USER_KEY, String(id)); } catch { /* ignore */ } },
  clear: () => { try { localStorage.removeItem(USER_KEY); } catch { /* ignore */ } },
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still loading

  useEffect(() => {
    if (!store.get()) return setUser(null);
    api.me()
      .then((r) => { if (!r.user) store.clear(); setUser(r.user); })
      .catch(() => setUser(null));
  }, []);

  const value = {
    user,
    /** Create or look up the user for this name and remember them on this device. */
    async enterName(name) {
      const { user } = await api.enterName(name);
      store.set(user.id);
      setUser(user);
    },
    /** Forget this device's identity (the user and their catches stay in the database). */
    switchUser() {
      store.clear();
      setUser(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
