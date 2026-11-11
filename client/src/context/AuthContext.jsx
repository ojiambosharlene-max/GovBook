import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '../services/api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export const homeFor = (role) => (role === 'admin' ? '/admin' : role === 'staff' ? '/staff' : '/app');

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  useEffect(() => {
    if (!getToken()) return;
    api.get('/auth/me').then((r) => setUser(r.user)).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);

  const logout = useCallback(() => { setToken(null); setUser(null); }, []);
  useEffect(() => { // any 401 from the API (expired / revoked token) signs the user out
    const h = () => { setToken(null); setUser(null); };
    window.addEventListener('govbook:unauthorized', h);
    return () => window.removeEventListener('govbook:unauthorized', h);
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await api.post('/auth/login', { email, password });
    setToken(r.token); setUser(r.user); return r.user;
  }, []);
  const register = useCallback(async (payload) => {
    const r = await api.post('/auth/register', payload);
    setToken(r.token); setUser(r.user); return r.user;
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout, setUser }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
