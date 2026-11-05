import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost } from '../hooks/useApi';

const AuthContext = createContext(null);

function readCachedUser() {
  try {
    const saved = localStorage.getItem('caliberate_user');
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(readCachedUser);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configError, setConfigError] = useState('');
  const [configAttempt, setConfigAttempt] = useState(0);
  const retryConfig = useCallback(() => setConfigAttempt(attempt => attempt + 1), []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer;

    setConfigLoaded(false);
    setConfigError('');
    apiGet('/auth/config')
      .then((config) => {
        if (!config || typeof config.demoMode !== 'boolean') throw new Error('Invalid sign-in configuration.');
        if (!cancelled) setDemoMode(config.demoMode);
      })
      .catch((error) => {
        if (cancelled) return;
        setConfigError(error.message || 'Could not load sign-in options.');
        if (error.status === 429) {
          retryTimer = setTimeout(retryConfig, error.retryAfterMs || 30000);
        }
      })
      .finally(() => {
        if (!cancelled) setConfigLoaded(true);
      });

    return () => { cancelled = true; clearTimeout(retryTimer); };
  }, [configAttempt, retryConfig]);

  useEffect(() => {
    let cancelled = false;

    // The session is an httpOnly cookie. Always validate it with the server
    // instead of trusting cached profile data.
    localStorage.removeItem('caliberate_token');
    apiGet('/auth/me')
      .then((user) => {
        if (cancelled) return;
        setCurrentUser(user);
        localStorage.setItem('caliberate_user', JSON.stringify(user));
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem('caliberate_user');
        setCurrentUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await apiPost('/auth/login', { email, password });
    localStorage.removeItem('caliberate_token');
    localStorage.setItem('caliberate_user', JSON.stringify(data.user));
    setCurrentUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiPost('/auth/logout', {});
    } catch {
      // Local state is cleared even if the server session was already gone.
    }
    localStorage.removeItem('caliberate_token');
    localStorage.removeItem('caliberate_user');
    setCurrentUser(null);
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const data = await apiPost('/auth/change-password', { currentPassword, newPassword });
    localStorage.removeItem('caliberate_token');
    localStorage.setItem('caliberate_user', JSON.stringify(data.user));
    setCurrentUser(data.user);
    return data.user;
  }, []);

  const refreshUser = useCallback(async () => {
    const user = await apiGet('/auth/me');
    setCurrentUser(user);
    localStorage.setItem('caliberate_user', JSON.stringify(user));
    return user;
  }, []);

  const value = {
    currentUser,
    login,
    logout,
    changePassword,
    refreshUser,
    loading,
    demoMode,
    configLoaded,
    configError,
    retryConfig,
    isAuthenticated: !!currentUser,
    role: currentUser?.role || null,
    isPrivileged: currentUser?.role === 'Admin' || currentUser?.role === 'Operations',
    isAdmin: currentUser?.role === 'Admin',
    isPanel: currentUser?.role === 'Panel',
    isTA: currentUser?.role === 'TA',
    mustChangePassword: Boolean(currentUser?.mustChangePassword)
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
