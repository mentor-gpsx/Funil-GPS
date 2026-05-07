import React, { useState, FormEvent } from 'react';
import { useAuth } from '@/hooks/useAuth';

export interface LoginFormProps {
  onSuccess?: () => void;
  onMfaRequired?: (sessionToken: string) => void;
  apiBaseUrl?: string;
}

/**
 * LoginForm — email + password authentication.
 *
 * On success without MFA: invokes onSuccess(). On success WITH MFA enrolled:
 * invokes onMfaRequired(sessionToken) and the parent should mount the MFA
 * verification view.
 *
 * Accessibility: form uses `aria-busy`, error messages use `role="alert"`,
 * inputs have explicit labels.
 */
export const LoginForm: React.FC<LoginFormProps> = ({
  onSuccess,
  onMfaRequired,
  apiBaseUrl = '/api',
}) => {
  const { login, loading, error } = useAuth(apiBaseUrl);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLocalError(null);

    if (!email || !password) {
      setLocalError('Email and password are required');
      return;
    }

    try {
      const result = await login(email, password);
      if (result.mfaRequired) {
        onMfaRequired?.(result.sessionToken);
      } else {
        onSuccess?.();
      }
    } catch {
      // error is already in `error` from useAuth
    }
  };

  const displayError = localError || error;

  return (
    <form
      className="login-form"
      onSubmit={handleSubmit}
      aria-busy={loading}
      data-testid="login-form"
    >
      <h2>Sign in</h2>

      <label htmlFor="login-email">Email</label>
      <input
        id="login-email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
        disabled={loading}
        data-testid="login-email"
      />

      <label htmlFor="login-password">Password</label>
      <input
        id="login-password"
        type="password"
        autoComplete="current-password"
        required
        minLength={8}
        value={password}
        onChange={e => setPassword(e.target.value)}
        disabled={loading}
        data-testid="login-password"
      />

      {displayError && (
        <div role="alert" className="login-form__error" data-testid="login-error">
          {displayError}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !email || !password}
        data-testid="login-submit"
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
};
