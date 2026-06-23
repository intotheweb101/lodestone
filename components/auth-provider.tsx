'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface AuthUser { id: string; email: string; name: string; role: string; avatar_url: string | null; username: string }
interface AuthCtx { user: AuthUser | null; loading: boolean; refetch: () => Promise<void>; logout: () => Promise<void> }
const Ctx = createContext<AuthCtx>({ user: null, loading: true, refetch: async () => {}, logout: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refetch() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json() as { user: AuthUser | null };
      setUser(data.user);
    } catch { setUser(null); } finally { setLoading(false); }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }

  useEffect(() => { refetch(); }, []);
  return <Ctx.Provider value={{ user, loading, refetch, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }
