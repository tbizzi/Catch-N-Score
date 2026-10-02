import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabaseClient.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

async function resolveProfile(session) {
  if (!session) return null;
  const { data, error } = await supabase.from('profiles').select('id, username, is_admin').eq('id', session.user.id).maybeSingle();
  if (error) throw error;
  return data;
}

function friendlyAuthError(error) {
  if (/already registered/i.test(error.message)) return new Error('That email is already registered');
  return new Error(error.message);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still loading
  const [recovering, setRecovering] = useState(false); // true after a password-reset email link is opened

  useEffect(() => {
    // onAuthStateChange fires once immediately with the current session
    // (INITIAL_SESSION), then again on every future sign-in/out/token event.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      resolveProfile(session).then(setUser).catch(() => setUser(null));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = {
    user,
    recovering,
    /** Returns { needsConfirmation } — true if the Supabase project requires
     * confirming the email before a session is issued (signUp() then
     * returns no session, so the caller should show a "check your email"
     * notice rather than appearing to do nothing). */
    async signUp(email, password, username) {
      if (!USERNAME_RE.test(username)) throw new Error('Username must be 3–20 letters, numbers or underscores');
      if (password.length < 8) throw new Error('Password must be at least 8 characters');
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username } } });
      if (error) throw friendlyAuthError(error);
      return { needsConfirmation: !data.session };
    },
    async signIn(identifier, password) {
      let email = identifier;
      if (!identifier.includes('@')) {
        const { data } = await supabase.rpc('email_for_login', { p_identifier: identifier });
        email = data || identifier; // fall back to a doomed signInWithPassword call -> same generic error below
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error('Invalid email/username or password');
    },
    async signOut() {
      await supabase.auth.signOut();
      setUser(null);
    },
    async forgotPassword(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw new Error(error.message);
    },
    async updatePassword(password) {
      if (password.length < 8) throw new Error('Password must be at least 8 characters');
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
    },
    finishRecovery() {
      setRecovering(false);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
