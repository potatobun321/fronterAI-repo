import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
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
    localStorage.removeItem('frontier_session');
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
      loadMembers
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
