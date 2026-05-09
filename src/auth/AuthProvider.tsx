import type { ReactNode } from 'react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { getCurrentUser, syncAuth, type CurrentUser } from '../api/auth';
import { AuthContext, type AuthContextValue, type AuthStatus } from './AuthContext';
import { classifyAuthSyncFailure, getStatusAfterFirebaseSignInFailure } from './session';
import { getFirebaseAuth } from './firebase';

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const authConfig = useMemo(() => getFirebaseAuth(), []);
  const auth = authConfig.ok ? authConfig.auth : null;
  const [status, setStatus] = useState<AuthStatus>(authConfig.ok ? 'loading' : 'config-error');
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const syncAttemptRef = useRef(0);

  const runSync = useCallback(async (firebaseUser: User) => {
    const attempt = syncAttemptRef.current + 1;
    syncAttemptRef.current = attempt;
    setStatus('syncing');

    try {
      const token = await firebaseUser.getIdToken();
      const user = await syncAuth(() => token);

      if (syncAttemptRef.current !== attempt) {
        return;
      }

      setCurrentUser(user);
      setStatus('authenticated');
    } catch (error) {
      if (syncAttemptRef.current !== attempt) {
        return;
      }

      const failure = classifyAuthSyncFailure(error);
      setCurrentUser(null);
      setStatus(failure);

      if (failure === 'invalid-session' && auth) {
        await signOut(auth);
      }
    }
  }, [auth]);

  useEffect(() => {
    if (!auth) {
      return undefined;
    }

    return onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        syncAttemptRef.current += 1;
        setCurrentUser(null);
        setStatus((previous) => previous === 'invalid-session' ? 'invalid-session' : 'unauthenticated');
        return;
      }

      void runSync(firebaseUser);
    });
  }, [auth, runSync]);

  const login = useCallback(async (email: string, password: string) => {
    if (!auth) {
      setStatus('config-error');
      return;
    }

    setStatus('syncing');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      setCurrentUser(null);
      setStatus(getStatusAfterFirebaseSignInFailure());
      throw error;
    }
  }, [auth]);

  const logout = useCallback(async () => {
    if (!auth) {
      setStatus('unauthenticated');
      return;
    }

    await signOut(auth);
    setCurrentUser(null);
    setStatus('unauthenticated');
  }, [auth]);

  const retrySync = useCallback(async () => {
    if (!auth?.currentUser) {
      setStatus('unauthenticated');
      return;
    }

    await runSync(auth.currentUser);
  }, [auth, runSync]);

  const refreshCurrentUser = useCallback(async () => {
    if (!auth?.currentUser) {
      setCurrentUser(null);
      setStatus('unauthenticated');
      return null;
    }

    try {
      const token = await auth.currentUser.getIdToken();
      const user = await getCurrentUser(() => token);
      setCurrentUser(user);
      setStatus('authenticated');
      return user;
    } catch (error) {
      const failure = classifyAuthSyncFailure(error);

      if (failure === 'invalid-session' || failure === 'account-not-found') {
        setCurrentUser(null);
        setStatus(failure);
      }

      if (failure === 'invalid-session') {
        await signOut(auth);
      }

      throw error;
    }
  }, [auth]);

  const getAccessToken = useCallback(async () => {
    if (!auth?.currentUser) {
      return null;
    }

    return auth.currentUser.getIdToken();
  }, [auth]);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    currentUser,
    configErrorKeys: authConfig.ok ? [] : authConfig.missingKeys,
    login,
    logout,
    retrySync,
    refreshCurrentUser,
    getAccessToken,
  }), [authConfig, currentUser, getAccessToken, login, logout, refreshCurrentUser, retrySync, status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
