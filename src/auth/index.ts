export { AuthProvider } from './AuthProvider';
export { useAuth } from './AuthContext';
export { ProtectedRoute } from './ProtectedRoute';
export {
  canAccessProperty,
  classifyAuthSyncFailure,
  getLoginViewState,
  getRoleLabel,
  getSafeReturnTo,
  getStatusAfterFirebaseSignInFailure,
  hasRole,
  shouldShowSessionExpiredNotice,
} from './session';
export type { AuthFailureKind, UserRole } from './session';
