import React, { ReactNode } from 'react';
import { useAuth, AuthUser } from '@/hooks/useAuth';

export interface ProtectedRouteProps {
  /** Roles allowed to access this route. If omitted, any authenticated user passes. */
  roles?: Array<AuthUser['role']>;
  /** Render this when the user is unauthenticated (default: null). */
  fallback?: ReactNode;
  /** Render this when the user is authenticated but role check fails. */
  forbiddenFallback?: ReactNode;
  /**
   * Optional redirect callback (e.g. to /login). Invoked once when the
   * user is unauthenticated, leaving the actual navigation strategy to
   * the host app (next/router, react-router, etc.).
   */
  onUnauthenticated?: () => void;
  children: ReactNode;
  apiBaseUrl?: string;
}

/**
 * ProtectedRoute — guard component for client-side routes.
 *
 * Combines authentication AND optional RBAC check. The route renders
 * children only if:
 *   1. User is authenticated (has tokens).
 *   2. If `roles` is provided, user.role is one of them.
 *
 * Otherwise it renders `fallback` (unauthenticated) or
 * `forbiddenFallback` (wrong role) and optionally fires
 * `onUnauthenticated` so the host app can redirect.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  roles,
  fallback = null,
  forbiddenFallback = <div role="alert">Access denied — insufficient permissions.</div>,
  onUnauthenticated,
  children,
  apiBaseUrl = '/api',
}) => {
  const { isAuthenticated, hasRole } = useAuth(apiBaseUrl);

  React.useEffect(() => {
    if (!isAuthenticated && onUnauthenticated) {
      onUnauthenticated();
    }
  }, [isAuthenticated, onUnauthenticated]);

  if (!isAuthenticated) {
    return <>{fallback}</>;
  }

  if (roles && roles.length > 0 && !hasRole(...roles)) {
    return <>{forbiddenFallback}</>;
  }

  return <>{children}</>;
};
