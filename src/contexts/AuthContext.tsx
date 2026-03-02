'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import Cookies from 'js-cookie';
import { TOKEN_KEY } from '@/lib/constants';
import { authService } from '@/services/auth.service';
import type { User } from '@/lib/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    const token = Cookies.get(TOKEN_KEY);
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await authService.me();
      setUser(res.data);
    } catch {
      Cookies.remove(TOKEN_KEY);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (email: string, password: string) => {
    const res = await authService.login({ email, password });
    Cookies.set(TOKEN_KEY, res.data.token, { expires: 7 });
    setUser(res.data.user);
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch {
      // ignore error
    }
    Cookies.remove(TOKEN_KEY);
    setUser(null);
  };

  const isAdmin = user?.role?.name === 'ADMIN';

  const hasPermission = (permission: string): boolean => {
    if (!user || !user.role?.permissions) return false;
    if (isAdmin) return true;
    return user.role.permissions.some((p) => p.name === permission);
  };

  const hasAnyPermission = (permissions: string[]): boolean => {
    return permissions.some((p) => hasPermission(p));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission, hasAnyPermission, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
