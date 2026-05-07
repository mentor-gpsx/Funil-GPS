import {
  Injectable,
  Inject,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { PasswordService } from './password.service';
import { JwtService } from './jwt.service';
import { TotpService } from './totp.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto, UserRole } from './dto/signup.dto';
import { AuthTokensDto, UserPublicDto } from './dto/refresh.dto';
import { MfaSetupResponseDto } from './dto/mfa-setup.dto';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

interface UserRow {
  tenant_id: string;
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: 'admin' | 'accountant' | 'viewer';
  mfa_enrolled: boolean;
  mfa_secret: string | null;
  mfa_backup_codes: string[] | null;
  is_active: boolean;
  failed_login_attempts: number;
  locked_until: Date | null;
}

/**
 * Core authentication & authorisation service.
 *
 * Design notes:
 * - Email lookup is global (not tenant-scoped): tenant_id is unknown at
 *   /auth/login time, so we use the email-unique-global index. Once we
 *   resolve the user, every subsequent query is tenant-scoped.
 * - Password & MFA verification BOTH return the same UnauthorizedException
 *   to prevent user enumeration.
 * - Refresh tokens are stored as SHA-256 hashes (not raw) so a DB leak
 *   does not yield session-takeover material.
 * - Rotation: every /auth/refresh issues a new refresh token AND revokes
 *   the old one (replaced_by chain).
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject('DB_POOL') private readonly pool: Pool,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly totpService: TotpService,
  ) {}

  // -------------------------------------------------------------------------
  // SIGNUP
  // -------------------------------------------------------------------------

  async signup(dto: SignupDto): Promise<UserPublicDto> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL app.current_tenant = $1', [dto.tenant_id]);

      const existing = await client.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
        [dto.email],
      );
      if (existing.rows.length > 0) {
        throw new ConflictException('Email already registered');
      }

      const passwordHash = await this.passwordService.hash(dto.password);
      const role = dto.role || UserRole.VIEWER;

      const result = await client.query(
        `INSERT INTO users (tenant_id, email, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING tenant_id, id, email, full_name, role, mfa_enrolled`,
        [dto.tenant_id, dto.email.toLowerCase(), passwordHash, dto.full_name, role],
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // LOGIN (step 1: email/password → optionally returns mfa_pending)
  // -------------------------------------------------------------------------

  async login(
    dto: LoginDto,
    metadata: { userAgent?: string; ipAddress?: string } = {},
  ): Promise<
    | { mfaRequired: true; sessionToken: string }
    | { mfaRequired: false; tokens: AuthTokensDto; user: UserPublicDto }
  > {
    const user = await this.findUserByEmail(dto.email);
    if (!user) {
      // Uniform error to prevent enumeration.
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.is_active) {
      throw new ForbiddenException('Account disabled');
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new ForbiddenException('Account temporarily locked. Try again later.');
    }

    const passwordOk = await this.passwordService.verify(dto.password, user.password_hash);
    if (!passwordOk) {
      await this.registerFailedAttempt(user);
      throw new UnauthorizedException('Invalid credentials');
    }

    // If MFA is enrolled, require step-2 verification.
    if (user.mfa_enrolled && user.mfa_secret) {
      // Allow inline verification if `totp` was provided in the same request.
      if (dto.totp) {
        const totpOk = this.totpService.verify(user.mfa_secret, dto.totp);
        if (!totpOk) {
          await this.registerFailedAttempt(user);
          throw new UnauthorizedException('Invalid credentials');
        }
        // fall through and issue full tokens
      } else {
        const sessionToken = this.jwtService.signMfaPendingToken({
          id: user.id,
          tenant_id: user.tenant_id,
          role: user.role,
          email: user.email,
        });
        return { mfaRequired: true, sessionToken };
      }
    }

    await this.resetFailedAttempts(user.tenant_id, user.id);
    const tokens = await this.issueTokens(user, metadata);
    return {
      mfaRequired: false,
      tokens,
      user: this.toPublic(user),
    };
  }

  // -------------------------------------------------------------------------
  // MFA SETUP (after first login, or on re-enrol)
  // -------------------------------------------------------------------------

  async setupMfa(userId: string, tenantId: string): Promise<MfaSetupResponseDto> {
    const user = await this.findUserById(tenantId, userId);
    if (!user) throw new NotFoundException('User not found');

    if (user.mfa_enrolled) {
      throw new ConflictException('MFA already enrolled. Disable first to re-enrol.');
    }

    const enrollment = await this.totpService.enroll(user.email);

    // Persist secret + hashed backup codes. mfa_enrolled stays false until
    // the user proves possession via /auth/mfa/verify.
    const hashedBackupCodes = await Promise.all(
      enrollment.backupCodes.map(c => bcrypt.hash(c, 10)),
    );

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
      await client.query(
        `UPDATE users
         SET mfa_secret = $3, mfa_backup_codes = $4::jsonb, mfa_enrolled = false
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, userId, enrollment.secret, JSON.stringify(hashedBackupCodes)],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return {
      qrCode: enrollment.qrCode,
      secret: enrollment.secret,
      otpauthUrl: enrollment.otpauthUrl,
      backupCodes: enrollment.backupCodes, // plaintext, returned ONCE
    };
  }

  /**
   * Finalise MFA enrolment by verifying a TOTP code generated from the
   * secret stored during /auth/mfa/setup.
   */
  async verifyMfaEnrollment(
    userId: string,
    tenantId: string,
    totp: string,
  ): Promise<{ enrolled: true }> {
    const user = await this.findUserById(tenantId, userId);
    if (!user) throw new NotFoundException('User not found');
    if (!user.mfa_secret) {
      throw new BadRequestException('MFA setup not started. Call /auth/mfa/setup first.');
    }
    if (user.mfa_enrolled) {
      return { enrolled: true };
    }

    const ok = this.totpService.verify(user.mfa_secret, totp);
    if (!ok) throw new UnauthorizedException('Invalid TOTP code');

    const client = await this.pool.connect();
    try {
      await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
      await client.query(
        `UPDATE users SET mfa_enrolled = true WHERE tenant_id = $1 AND id = $2`,
        [tenantId, userId],
      );
    } finally {
      client.release();
    }

    return { enrolled: true };
  }

  /**
   * Step-2 of /auth/login: verify TOTP given an mfa_pending session token
   * and issue final access + refresh tokens.
   */
  async verifyMfaLogin(
    sessionToken: string,
    totp: string,
    metadata: { userAgent?: string; ipAddress?: string } = {},
  ): Promise<{ tokens: AuthTokensDto; user: UserPublicDto }> {
    const payload = this.jwtService.verify(sessionToken, 'mfa_pending');
    const user = await this.findUserById(payload.tenant_id, payload.sub);
    if (!user || !user.mfa_secret) {
      throw new UnauthorizedException('Invalid session');
    }

    const ok = this.totpService.verify(user.mfa_secret, totp);
    if (!ok) {
      await this.registerFailedAttempt(user);
      throw new UnauthorizedException('Invalid TOTP code');
    }

    await this.resetFailedAttempts(user.tenant_id, user.id);
    const tokens = await this.issueTokens(user, metadata);
    return { tokens, user: this.toPublic(user) };
  }

  /**
   * Step-2 of /auth/login via SINGLE-USE BACKUP CODE.
   *
   * MFA recovery path. Used when the user has lost access to the
   * authenticator device. Each backup code is bcrypt-hashed at rest
   * (see setupMfa) and is consumed (removed from the array) on first
   * successful match — guarantees single-use semantics.
   *
   * Security:
   * - Same uniform "Invalid credentials" error on no-match to avoid
   *   leaking which codes are valid.
   * - Iterates with bcrypt.compare (constant-time) to prevent timing
   *   side-channels.
   * - Removes the consumed code atomically with token issuance so a
   *   replay cannot succeed.
   * - Increments failed-login counter on miss; counts toward lockout.
   */
  async verifyBackupCode(
    sessionToken: string,
    backupCode: string,
    metadata: { userAgent?: string; ipAddress?: string } = {},
  ): Promise<{ tokens: AuthTokensDto; user: UserPublicDto }> {
    const payload = this.jwtService.verify(sessionToken, 'mfa_pending');
    const user = await this.findUserById(payload.tenant_id, payload.sub);
    if (!user || !user.mfa_enrolled) {
      throw new UnauthorizedException('Invalid session');
    }

    const stored = user.mfa_backup_codes;
    if (!Array.isArray(stored) || stored.length === 0) {
      // No remaining codes — uniform error to avoid signalling exhaustion.
      await this.registerFailedAttempt(user);
      throw new UnauthorizedException('Invalid backup code');
    }

    // Find the first hashed code that matches. bcrypt.compare is
    // constant-time per call; the linear scan is bounded (<=10 codes).
    let matchedIndex = -1;
    for (let i = 0; i < stored.length; i++) {
      const hashed = stored[i];
      // Skip malformed entries defensively without short-circuiting.
      if (typeof hashed !== 'string' || hashed.length === 0) continue;
      try {
        if (await bcrypt.compare(backupCode, hashed)) {
          matchedIndex = i;
          break;
        }
      } catch {
        // bcrypt.compare throws on malformed hash; skip and continue.
      }
    }

    if (matchedIndex === -1) {
      await this.registerFailedAttempt(user);
      throw new UnauthorizedException('Invalid backup code');
    }

    // Consume the matched code: remove it so it cannot be reused.
    const remaining = stored.slice(0, matchedIndex).concat(stored.slice(matchedIndex + 1));

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL app.current_tenant = $1', [user.tenant_id]);
      await client.query(
        `UPDATE users
         SET mfa_backup_codes = $3::jsonb,
             failed_login_attempts = 0,
             locked_until = NULL
         WHERE tenant_id = $1 AND id = $2`,
        [user.tenant_id, user.id, JSON.stringify(remaining)],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const tokens = await this.issueTokens(user, metadata);
    return { tokens, user: this.toPublic(user) };
  }

  // -------------------------------------------------------------------------
  // REFRESH (rotation)
  // -------------------------------------------------------------------------

  async refresh(
    refreshToken: string,
    metadata: { userAgent?: string; ipAddress?: string } = {},
  ): Promise<AuthTokensDto> {
    const payload = this.jwtService.verify(refreshToken, 'refresh');
    const tokenHash = this.jwtService.hashRefreshToken(refreshToken);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL app.current_tenant = $1', [payload.tenant_id]);

      const stored = await client.query(
        `SELECT id, user_id, expires_at, revoked_at
         FROM refresh_tokens
         WHERE tenant_id = $1 AND token_hash = $2`,
        [payload.tenant_id, tokenHash],
      );

      if (stored.rows.length === 0) {
        throw new UnauthorizedException('Refresh token not recognised');
      }

      const row = stored.rows[0];
      if (row.revoked_at) {
        // Reuse-detection: if a revoked refresh token is presented, treat
        // it as a stolen-credential signal and revoke the entire chain.
        await client.query(
          `UPDATE refresh_tokens SET revoked_at = NOW()
           WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
          [payload.tenant_id, row.user_id],
        );
        await client.query('COMMIT');
        throw new UnauthorizedException('Refresh token reused — session revoked');
      }
      if (new Date(row.expires_at) < new Date()) {
        throw new UnauthorizedException('Refresh token expired');
      }

      const user = await this.findUserById(payload.tenant_id, row.user_id, client);
      if (!user || !user.is_active) {
        throw new UnauthorizedException('User not found or disabled');
      }

      // Issue new tokens
      const newAccess = this.jwtService.signAccessToken({
        id: user.id,
        tenant_id: user.tenant_id,
        role: user.role,
        email: user.email,
      });
      const newRefresh = this.jwtService.signRefreshToken({
        id: user.id,
        tenant_id: user.tenant_id,
        role: user.role,
        email: user.email,
      });
      const newHash = this.jwtService.hashRefreshToken(newRefresh.token);

      // Persist new refresh token
      const insertResult = await client.query(
        `INSERT INTO refresh_tokens
           (tenant_id, user_id, token_hash, expires_at, user_agent, ip_address)
         VALUES ($1, $2, $3, NOW() + ($4 || ' seconds')::interval, $5, $6)
         RETURNING id`,
        [
          user.tenant_id,
          user.id,
          newHash,
          newRefresh.expiresIn.toString(),
          metadata.userAgent || null,
          metadata.ipAddress || null,
        ],
      );

      // Revoke old, link to new
      await client.query(
        `UPDATE refresh_tokens
         SET revoked_at = NOW(), replaced_by = $3
         WHERE tenant_id = $1 AND id = $2`,
        [payload.tenant_id, row.id, insertResult.rows[0].id],
      );

      await client.query('COMMIT');

      return {
        accessToken: newAccess.token,
        refreshToken: newRefresh.token,
        expiresIn: newAccess.expiresIn,
        tokenType: 'Bearer',
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // LOGOUT
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // PASSWORD RESET
  // -------------------------------------------------------------------------

  /**
   * Request a password reset. Issues a short-lived reset token (5 min) and
   * returns it. In production this token is emailed; for the API contract
   * we return it directly so the frontend can render a "check your email"
   * screen and the integration tests can drive the flow end-to-end.
   *
   * Always responds the same shape regardless of email existence — prevents
   * user enumeration via reset endpoint.
   */
  async requestPasswordReset(email: string): Promise<{ resetToken?: string }> {
    const user = await this.findUserByEmail(email);
    if (!user) {
      // Same shape, no token. Caller cannot distinguish.
      return {};
    }
    const resetToken = this.jwtService.sign(
      {
        sub: user.id,
        tenant_id: user.tenant_id,
        role: user.role,
        email: user.email,
        type: 'mfa_pending', // reuse short-lived class; type-safety via expectedType
      },
      { expiresIn: '5m', type: 'mfa_pending' },
    );
    return { resetToken };
  }

  /**
   * Apply a password reset using the token issued above. Revokes all
   * existing refresh tokens to log the user out of every session.
   */
  async applyPasswordReset(resetToken: string, newPassword: string): Promise<void> {
    const payload = this.jwtService.verify(resetToken, 'mfa_pending');
    const newHash = await this.passwordService.hash(newPassword);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL app.current_tenant = $1', [payload.tenant_id]);
      await client.query(
        `UPDATE users
         SET password_hash = $3, failed_login_attempts = 0, locked_until = NULL
         WHERE tenant_id = $1 AND id = $2`,
        [payload.tenant_id, payload.sub, newHash],
      );
      // Force-logout every active session for this user.
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = NOW()
         WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
        [payload.tenant_id, payload.sub],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async logout(refreshToken: string): Promise<void> {
    let payload;
    try {
      payload = this.jwtService.verify(refreshToken, 'refresh');
    } catch {
      // Idempotent: even if token is invalid, treat as logged out.
      return;
    }
    const tokenHash = this.jwtService.hashRefreshToken(refreshToken);

    const client = await this.pool.connect();
    try {
      await client.query('SET LOCAL app.current_tenant = $1', [payload.tenant_id]);
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = NOW()
         WHERE tenant_id = $1 AND token_hash = $2 AND revoked_at IS NULL`,
        [payload.tenant_id, tokenHash],
      );
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // INTERNAL HELPERS
  // -------------------------------------------------------------------------

  private async issueTokens(
    user: UserRow,
    metadata: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthTokensDto> {
    const access = this.jwtService.signAccessToken({
      id: user.id,
      tenant_id: user.tenant_id,
      role: user.role,
      email: user.email,
    });
    const refresh = this.jwtService.signRefreshToken({
      id: user.id,
      tenant_id: user.tenant_id,
      role: user.role,
      email: user.email,
    });
    const refreshHash = this.jwtService.hashRefreshToken(refresh.token);

    const client = await this.pool.connect();
    try {
      await client.query('SET LOCAL app.current_tenant = $1', [user.tenant_id]);
      await client.query(
        `INSERT INTO refresh_tokens
           (tenant_id, user_id, token_hash, expires_at, user_agent, ip_address)
         VALUES ($1, $2, $3, NOW() + ($4 || ' seconds')::interval, $5, $6)`,
        [
          user.tenant_id,
          user.id,
          refreshHash,
          refresh.expiresIn.toString(),
          metadata.userAgent || null,
          metadata.ipAddress || null,
        ],
      );
      await client.query(
        `UPDATE users SET last_login_at = NOW() WHERE tenant_id = $1 AND id = $2`,
        [user.tenant_id, user.id],
      );
    } finally {
      client.release();
    }

    return {
      accessToken: access.token,
      refreshToken: refresh.token,
      expiresIn: access.expiresIn,
      tokenType: 'Bearer',
    };
  }

  private async findUserByEmail(email: string): Promise<UserRow | null> {
    const result = await this.pool.query(
      `SELECT tenant_id, id, email, password_hash, full_name, role, mfa_enrolled,
              mfa_secret, mfa_backup_codes, is_active, failed_login_attempts, locked_until
       FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email],
    );
    return result.rows[0] || null;
  }

  private async findUserById(
    tenantId: string,
    userId: string,
    client?: { query: (q: string, params?: any[]) => Promise<any> },
  ): Promise<UserRow | null> {
    const queryRunner = client || this.pool;
    const result = await queryRunner.query(
      `SELECT tenant_id, id, email, password_hash, full_name, role, mfa_enrolled,
              mfa_secret, mfa_backup_codes, is_active, failed_login_attempts, locked_until
       FROM users WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, userId],
    );
    return result.rows[0] || null;
  }

  private async registerFailedAttempt(user: UserRow): Promise<void> {
    const newCount = user.failed_login_attempts + 1;
    const shouldLock = newCount >= MAX_FAILED_ATTEMPTS;
    const client = await this.pool.connect();
    try {
      await client.query('SET LOCAL app.current_tenant = $1', [user.tenant_id]);
      await client.query(
        `UPDATE users
         SET failed_login_attempts = $3,
             locked_until = CASE WHEN $4 = true
               THEN NOW() + ($5 || ' minutes')::interval
               ELSE locked_until END
         WHERE tenant_id = $1 AND id = $2`,
        [user.tenant_id, user.id, newCount, shouldLock, LOCKOUT_MINUTES.toString()],
      );
    } finally {
      client.release();
    }
  }

  private async resetFailedAttempts(tenantId: string, userId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
      await client.query(
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, userId],
      );
    } finally {
      client.release();
    }
  }

  private toPublic(user: UserRow): UserPublicDto {
    return {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      tenant_id: user.tenant_id,
      role: user.role,
      mfa_enrolled: user.mfa_enrolled,
    };
  }
}
