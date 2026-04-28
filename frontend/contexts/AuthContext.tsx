"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api, type BackendUser } from "@/lib/api";

interface AuthContextValue {
  /** Null when not signed in; populated after Google sign-in. */
  user: BackendUser | null;
  /** True while the initial session-restore call is in flight. */
  loading: boolean;
  /** Exchange a Google ID token credential for a backend session. */
  signIn: (credential: string) => Promise<void>;
  /** Destroy the backend session and clear local auth state. */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<BackendUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount (page refresh).
  useEffect(() => {
    api.auth.me()
      .then(setUser)
      .catch(() => { /* no session — fine */ })
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (credential: string) => {
    const u = await api.auth.google(credential);
    setUser(u);
  }, []);

  const signOut = useCallback(async () => {
    await api.auth.disconnect().catch(() => {});
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
