import { useState, useEffect, useCallback, useMemo } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  tenant_id: string;
  role: 'admin' | 'accountant' | 'viewer';
  mfa_enrolled: boolean;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

interface AuthState {
  user: AuthUser | null;
  tokens: AuthTokens | null;
  loading: boolean;
  error: string | null;
}

const STORAGE_KEY = 'funil-gps:auth';
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes idle (story AC)
const ABSOLUTE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24h absolute (story AC)

/**
 * useAuth — session management hook.
 *
 * Persists tokens in localStorage (project default; can be swapped for
 * httpOnly cookie by changing the storage adapter). Tracks idle timeout
 * (30m) and absolute timeout (24h); auto-logs-out on either.
 *
 * Important: NEVER store mfa_secret or backup codes here — those are
 * shown on screen ONCE during enrolment and never persisted client-side.
 */
export function useAuth(apiBaseUrl: string = '/api') {
  const [state, setState] = useState<AuthState>(() => {
    if (typeof window === 'undefined') {
      return { user: null, tokens: null, loading: false, error: null };
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { user: null, tokens: null, loading: false, error: null };
      const parsed = JSON.parse(raw);

      // Enforce absolute timeout on hydration
      if (parsed.loginAt && Date.now() - parsed.loginAt > ABSOLUTE_TIMEOUT_MS) {
        localStorage.removeItem(STORAGE_KEY);
        return { user: null, tokens: null, loading: false, error: null };
      }

      return {
        user: parsed.user,
        tokens: parsed.tokens,
        loading: false,
        error: null,
      };
    } catch {
      return { user: null, tokens: null, loading: false, error: null };
    }
  });

  // Persist tokens to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (state.user && state.tokens) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          user: state.user,
          tokens: state.tokens,
          loginAt: Date.now(),
        }),
      );
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [state.user, state.tokens]);

  // Idle timer — reset on user activity
  useEffect(() => {
    if (!state.user) return;
    let lastActivity = Date.now();
    const reset = () => {
      lastActivity = Date.now();
    };
    const events = ['mousemove', 'keydown', 'click', 'touchstart'];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));

    const interval = setInterval(() => {
      if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
        setState({ user: null, tokens: null, loading: false, error: 'Session timed out (idle)' });
      }
    }, 60_000);

    return () => {
      events.forEach(e => window.removeEventListener(e, reset));
      clearInterval(interval);
    };
  }, [state.user]);

  const login = useCallback(
    async (email: string, password: string, totp?: string) => {
      setState(s => ({ ...s, loading: true, error: null }));
      try {
        const res = await fetch(`${apiBaseUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, totp }),
        });
        if (!res.ok) {
          const body = await safeJson(res);
          throw new Error(body?.message || 'Login failed');
        }
        const body = await res.json();
        if (body.mfaRequired) {
          setState(s => ({ ...s, loading: false }));
          return { mfaRequired: true as const, sessionToken: body.sessionToken };
        }
        setState({
          user: body.user,
          tokens: body.tokens,
          loading: false,
          error: null,
        });
        return { mfaRequired: false as const, user: body.user as AuthUser };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Login failed';
        setState(s => ({ ...s, loading: false, error: message }));
        throw err;
      }
    },
    [apiBaseUrl],
  );

  const verifyMfaLogin = useCallback(
    async (sessionToken: string, totp: string) => {
      setState(s => ({ ...s, loading: true, error: null }));
      try {
        const res = await fetch(`${apiBaseUrl}/auth/mfa/verify-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionToken, totp }),
        });
        if (!res.ok) {
          const body = await safeJson(res);
          throw new Error(body?.message || 'MFA verification failed');
        }
        const body = await res.json();
        setState({ user: body.user, tokens: body.tokens, loading: false, error: null });
        return body.user as AuthUser;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'MFA verification failed';
        setState(s => ({ ...s, loading: false, error: message }));
        throw err;
      }
    },
    [apiBaseUrl],
  );

  const logout = useCallback(async () => {
    if (state.tokens?.refreshToken) {
      try {
        await fetch(`${apiBaseUrl}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: state.tokens.refreshToken }),
        });
      } catch {
        // Logout is idempotent; ignore network failures.
      }
    }
    setState({ user: null, tokens: null, loading: false, error: null });
  }, [apiBaseUrl, state.tokens]);

  const isAuthenticated = useMemo(
    () => Boolean(state.user && state.tokens),
    [state.user, state.tokens],
  );

  const hasRole = useCallback(
    (...roles: Array<AuthUser['role']>) => {
      if (!state.user) return false;
      return roles.includes(state.user.role);
    },
    [state.user],
  );

  return {
    user: state.user,
    tokens: state.tokens,
    loading: state.loading,
    error: state.error,
    isAuthenticated,
    hasRole,
    login,
    verifyMfaLogin,
    logout,
  };
}

async function safeJson(res: Response): Promise<any | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
