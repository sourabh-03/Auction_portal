import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setAuthToken } from '../api/client';
import { disconnectSocket } from '../api/socket';
import { AuthState, TeamUser, VendorUser } from '../types';

const STORAGE_KEY = 'procease_auction_auth';

interface AuthContextValue {
  auth: AuthState | null;
  loginTeam: (email: string, password: string) => Promise<void>;
  loginVendor: (email: string, password: string) => Promise<void>;
  acceptNda: () => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    const initial = raw ? (JSON.parse(raw) as AuthState) : null;
    // Set synchronously during the lazy initializer, not only in the
    // useEffect below — on a hard reload / direct URL nav, React flushes
    // child mount effects BEFORE this component's own effect, so any child
    // that fetches on mount (NotificationBell, VendorProfile, etc.) would
    // otherwise fire its first request before the token was ever attached,
    // producing a spurious 401.
    setAuthToken(initial?.token ?? null);
    return initial;
  });

  useEffect(() => {
    setAuthToken(auth?.token ?? null);
    if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    else localStorage.removeItem(STORAGE_KEY);
  }, [auth]);

  // setAuthToken is called synchronously here, not left to the useEffect
  // above — the caller's navigate() to a protected route fires that route's
  // own data-fetching effect essentially immediately, and if that raced
  // ahead of the auth-sync effect the very first authenticated request
  // would go out with no Authorization header and 401.
  const loginTeam = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ accessToken: string; user: TeamUser }>('/auth/team/login', { email, password });
    setAuthToken(res.accessToken);
    setAuth({ kind: 'team', token: res.accessToken, team: res.user });
  }, []);

  const loginVendor = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ accessToken: string; vendor: VendorUser }>('/auth/vendor/login', { email, password });
    setAuthToken(res.accessToken);
    setAuth({ kind: 'vendor', token: res.accessToken, vendor: res.vendor });
  }, []);

  const acceptNda = useCallback(async () => {
    setAuthToken(auth?.token ?? null);
    await api.post('/auth/vendor/accept-nda');
    setAuth((prev) => (prev?.vendor ? { ...prev, vendor: { ...prev.vendor, ndaAccepted: true } } : prev));
  }, [auth]);

  const signOut = useCallback(() => {
    disconnectSocket();
    setAuth(null);
  }, []);

  return (
    <AuthContext.Provider value={{ auth, loginTeam, loginVendor, acceptNda, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
