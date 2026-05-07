import React, { useState, useEffect, FormEvent } from 'react';

export interface MFASetupProps {
  /** Bearer access token (the user has just signed in but is not yet enrolled). */
  accessToken: string;
  /** API base URL, e.g. /api or http://localhost:3000/api */
  apiBaseUrl?: string;
  /** Called when enrolment + verification succeed. */
  onComplete?: () => void;
}

interface SetupState {
  qrCode: string;
  secret: string;
  backupCodes: string[];
  otpauthUrl: string;
}

/**
 * MFASetup — TOTP enrolment wizard.
 *
 * 3-step flow:
 *   1. POST /auth/mfa/setup → server returns QR + secret + backup codes
 *      (plaintext, shown ONCE).
 *   2. User scans QR with authenticator app.
 *   3. User submits 6-digit code → POST /auth/mfa/verify finalises.
 *
 * Backup codes are displayed once and the user must confirm they have
 * stored them before proceeding.
 */
export const MFASetup: React.FC<MFASetupProps> = ({
  accessToken,
  apiBaseUrl = '/api',
  onComplete,
}) => {
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [totp, setTotp] = useState('');
  const [confirmedBackup, setConfirmedBackup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'loading' | 'display' | 'verify' | 'done'>('loading');

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBaseUrl}/auth/mfa/setup`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.message || 'Failed to start MFA setup');
        }
        const data: SetupState = await res.json();
        if (cancelled) return;
        setSetup(data);
        setStep('display');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Setup failed');
        setStep('display');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [accessToken, apiBaseUrl]);

  const handleVerify = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(totp)) {
      setError('Enter a 6-digit code');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/auth/mfa/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ totp }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || 'Verification failed');
      }
      setStep('done');
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'loading' || (loading && !setup)) {
    return <div data-testid="mfa-loading">Preparing MFA…</div>;
  }

  if (step === 'done') {
    return (
      <div data-testid="mfa-done">
        <h2>MFA enabled</h2>
        <p>Multi-factor authentication is now active for your account.</p>
      </div>
    );
  }

  return (
    <div className="mfa-setup" data-testid="mfa-setup">
      <h2>Set up two-factor authentication</h2>

      {error && (
        <div role="alert" data-testid="mfa-error">
          {error}
        </div>
      )}

      {setup && step === 'display' && (
        <>
          <ol>
            <li>
              Scan the QR code with your authenticator (Google Authenticator,
              1Password, Authy, etc.):
              <div className="mfa-setup__qr">
                <img src={setup.qrCode} alt="MFA QR code" data-testid="mfa-qr" />
              </div>
              <p>
                Or enter the secret manually:{' '}
                <code data-testid="mfa-secret">{setup.secret}</code>
              </p>
            </li>
            <li>
              <strong>Save these backup codes</strong> — each works ONCE if you
              lose your authenticator:
              <ul className="mfa-setup__backup-codes" data-testid="mfa-backup-codes">
                {setup.backupCodes.map(code => (
                  <li key={code}>
                    <code>{code}</code>
                  </li>
                ))}
              </ul>
              <label>
                <input
                  type="checkbox"
                  checked={confirmedBackup}
                  onChange={e => setConfirmedBackup(e.target.checked)}
                  data-testid="mfa-backup-confirm"
                />{' '}
                I have stored my backup codes in a safe place.
              </label>
            </li>
          </ol>

          <button
            type="button"
            disabled={!confirmedBackup}
            onClick={() => setStep('verify')}
            data-testid="mfa-continue"
          >
            Continue to verification
          </button>
        </>
      )}

      {step === 'verify' && (
        <form onSubmit={handleVerify} data-testid="mfa-verify-form">
          <label htmlFor="mfa-totp">
            Enter the 6-digit code from your authenticator
          </label>
          <input
            id="mfa-totp"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
            required
            value={totp}
            onChange={e => setTotp(e.target.value.replace(/\D/g, ''))}
            data-testid="mfa-totp"
          />
          <button
            type="submit"
            disabled={loading || totp.length !== 6}
            data-testid="mfa-submit"
          >
            {loading ? 'Verifying…' : 'Verify & enable'}
          </button>
        </form>
      )}
    </div>
  );
};
