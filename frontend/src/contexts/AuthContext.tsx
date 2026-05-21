import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@/types';
import api from '@/services/api';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Re-fetches `/api/auth/me` and updates the cached user. Call this after
   *  any self-mutation (profile name, profileImage, etc.) so subscribers like
   *  the navbar avatar reflect the change without a full page reload. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Verify existing token on mount
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setLoading(false);
      return;
    }

    api
      .get<User>('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => localStorage.removeItem('auth_token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    const { data } = await api.post<{ user: User; token: string }>('/auth/login', {
      email,
      password,
    });
    localStorage.setItem('auth_token', data.token);
    setUser(data.user);
  };

  const logout = (): void => {
    localStorage.removeItem('auth_token');
    setUser(null);
  };

  const refreshUser = async (): Promise<void> => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    try {
      const { data } = await api.get<User>('/auth/me');
      setUser(data);
    } catch {
      // Swallow — a stale token gets cleared by the global 401 interceptor.
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within <AuthProvider>');
  return ctx;
}
