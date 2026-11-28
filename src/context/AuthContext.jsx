import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authNotice, setAuthNotice] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('frontier_theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('frontier_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const refreshUser = async () => {
    try {
      const res = await api.getCurrentUser();
      if (res && res.authenticated && res.user) {
        setCurrentUser(res.user);
      } else {
        setCurrentUser(null);
      }
    } catch (e) {
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async () => {
    try {
      const res = await api.getMembers();
      if (res && res.members) setMembers(res.members);
    } catch (e) {
      console.warn('Failed to load members:', e);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authParam = params.get('auth');
    const errorParam = params.get('error');
    const emailParam = params.get('email');

    if (authParam === 'pending_approval') {
      setAuthNotice({
        type: 'info',
        message: `Access request for ${emailParam || 'your account'} is pending Host approval.`
      });
      params.delete('auth');
      params.delete('email');
    } else if (authParam === 'oauth_success') {
      setAuthNotice({ type: 'success', message: 'Signed in with Google.' });
      params.delete('auth');
    } else if (authParam === 'login_required') {
      setAuthNotice({ type: 'info', message: 'Please sign in to join the meeting.' });
      params.delete('auth');
    } else if (errorParam) {
      const errorMessages = {
        oauth_not_configured: 'Google OAuth is not configured on the server.',
        csrf_state_mismatch: 'Sign-in state expired or mismatched. Please try again.',
        token_exchange_failed: 'Google token exchange failed. Please try again.',
        oauth_internal_error: 'Authentication failed due to a server error.'
      };
      setAuthNotice({
        type: 'error',
        message: errorMessages[errorParam] || `Sign-in error: ${errorParam}`
      });
      params.delete('error');
    }

    if (authParam || errorParam) {
      const remaining = params.toString();
      const nextUrl = window.location.pathname + (remaining ? `?${remaining}` : '') + window.location.hash;
      window.history.replaceState({}, '', nextUrl);
    }

    refreshUser();
    loadMembers();
  }, []);

  const loginAs = async (identifier) => {
    try {
      let payload = {};
      if (typeof identifier === 'number') {
        payload = { member_id: identifier };
      } else if (typeof identifier === 'string') {
        payload = identifier.includes('@') ? { email: identifier } : { member_id: parseInt(identifier, 10) };
      } else if (typeof identifier === 'object' && identifier !== null) {
        payload = identifier;
      }
      const res = await api.loginAs(payload);
      if (res && res.user) {
        setCurrentUser(res.user);
        await loadMembers();
      }
      return res;
    } catch (err) {
      console.error('Login failed:', err);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (_) {}
    setCurrentUser(null);
  };

  const isHost = Boolean(currentUser && Number(currentUser.is_host) === 1);

  return (
    <AuthContext.Provider value={{
      currentUser,
      isHost,
      members,
      loading,
      theme,
      toggleTheme,
      loginAs,
      logout,
      refreshUser,
      loadMembers,
      authNotice,
      clearAuthNotice: () => setAuthNotice(null)
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
