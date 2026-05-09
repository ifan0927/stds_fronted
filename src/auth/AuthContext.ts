import { createContext, useContext } from 'react';
import type { CurrentUser } from '../api/auth';
import type { AuthFailureKind } from './session';

export type AuthStatus =
  | 'config-error'
  | 'loading'
  | 'unauthenticated'
  | 'syncing'
  | 'authenticated'
  | AuthFailureKind;

export type AuthContextValue = {
  status: AuthStatus;
  currentUser: CurrentUser | null;
  configErrorKeys: string[];
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  retrySync: () => Promise<void>;
  refreshCurrentUser: () => Promise<CurrentUser | null>;
  getAccessToken: () => Promise<string | null>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
