import { Injectable, InternalServerErrorException } from '@nestjs/common';

/**
 * Supabase configuration loader.
 *
 * Two execution modes:
 *
 *   AUTH_PROVIDER=local    (default) — local JWT + bcrypt + speakeasy.
 *                          Supabase still used for storage/realtime, but
 *                          NOT for /auth.
 *
 *   AUTH_PROVIDER=supabase — delegate signup/login to Supabase Auth.
 *                          Custom claims (tenant_id, role) injected via
 *                          a Supabase auth-hook (see docs/supabase-auth-hook.sql).
 *
 * Switching providers is reversible: both write to the same `users` table
 * (Supabase's `auth.users` is shadow-copied via trigger into our `users`
 * table to keep tenant_id + role metadata canonical).
 *
 * For Story 1.4 we ship `AUTH_PROVIDER=local` as the tested path. The
 * Supabase wiring is provided as a non-default opt-in so the local tests
 * are deterministic and don't require a Supabase mock.
 */
export type AuthProvider = 'local' | 'supabase';

export interface SupabaseAuthConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  jwtSecret: string;
  jwtIssuer: string;
}

@Injectable()
export class SupabaseConfig {
  readonly provider: AuthProvider;
  readonly supabase: SupabaseAuthConfig | null;

  constructor() {
    this.provider = (process.env.AUTH_PROVIDER as AuthProvider) || 'local';

    if (this.provider === 'supabase') {
      const url = process.env.SUPABASE_URL;
      const anonKey = process.env.SUPABASE_ANON_KEY;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const jwtSecret = process.env.SUPABASE_JWT_SECRET;
      const jwtIssuer = process.env.SUPABASE_JWT_ISSUER || 'supabase';

      if (!url || !anonKey || !serviceRoleKey || !jwtSecret) {
        throw new InternalServerErrorException(
          'AUTH_PROVIDER=supabase requires SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET',
        );
      }
      this.supabase = { url, anonKey, serviceRoleKey, jwtSecret, jwtIssuer };
    } else {
      this.supabase = null;
    }
  }

  isSupabase(): boolean {
    return this.provider === 'supabase';
  }

  isLocal(): boolean {
    return this.provider === 'local';
  }
}
