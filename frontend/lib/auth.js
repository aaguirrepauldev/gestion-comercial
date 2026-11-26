'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, clearToken, getToken, setToken } from './api';

const AuthContext = createContext(null);

// A dónde va cada usuario al entrar: el superadmin a su panel; el resto, a su primer rubro.
export const homePath = (user) => (user.superadmin ? '/plataforma' : `/${user.modules[0] ?? ''}`);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('auth:logout', onLogout);

    if (getToken()) {
      api('/auth/me')
        .then(setUser)
        .catch(() => clearToken())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  const start = useCallback(({ token, user }) => {
    setToken(token);
    setUser(user);
    return user;
  }, []);

  const login = useCallback(
    async (username, password) => start(await api('/auth/login', { method: 'POST', body: { username, password } })),
    [start]
  );

  // Alta de un negocio nuevo: el servidor devuelve la sesión del admin ya iniciada.
  const register = useCallback(async (data) => start(await api('/auth/registro', { method: 'POST', body: data })), [start]);

  // Vuelve a leer el usuario (y el estado de la suscripción de su negocio).
  const refresh = useCallback(async () => setUser(await api('/auth/me')), []);

  // Cambiar la propia contraseña (obligatorio después de que el superadmin la blanquea).
  const changePassword = useCallback(
    async (actual, nueva) => start(await api('/auth/password', { method: 'PUT', body: { actual, nueva } })),
    [start]
  );

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, refresh, changePassword, logout }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
