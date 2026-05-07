import { Injectable, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

export interface JwtPayload {
  sub: string;            // user id
  tenant_id: string;      // custom claim — drives tenant middleware
  role: 'admin' | 'accountant' | 'viewer'; // custom claim — drives RBAC
  email: string;
  type: 'access' | 'refresh' | 'mfa_pending';
  iat?: number;
  exp?: number;
  jti?: string;           // unique token id, for refresh-token revocation
}

interface SignOptions {
  expiresIn: string | number;
  type: JwtPayload['type'];
  jti?: string;
}

/**
 * Centralised JWT signing & verification.
 *
 * Why a thin wrapper around `jsonwebtoken` instead of a direct dependency
 * inside AuthService: keeps secret-loading + algorithm choice + claim
 * shape in one place so other modules (guards, middleware) verify
 * identically. Single source of truth for token semantics.
 */
@Injectable()
export class JwtService {
  private readonly secret: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly accessTokenTtl: string;
  private readonly refreshTokenTtl: string;
  private readonly mfaPendingTtl: string;

  constructor() {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      // CONSTITUTIONAL: never hardcode, never run with weak secret in prod.
      // Allow a randomly-generated fallback ONLY in test/dev to keep tests
      // deterministic without leaking a hardcoded constant.
      if (process.env.NODE_ENV === 'production') {
        throw new InternalServerErrorException(
          'JWT_SECRET is required and must be >= 32 chars in production',
        );
      }
      this.secret = secret || crypto.randomBytes(32).toString('hex');
    } else {
      this.secret = secret;
    }

    this.issuer = process.env.JWT_ISSUER || 'funil-gps-erp';
    this.audience = process.env.JWT_AUDIENCE || 'funil-gps-api';
    this.accessTokenTtl = process.env.JWT_ACCESS_TTL || '15m';
    this.refreshTokenTtl = process.env.JWT_REFRESH_TTL || '24h'; // story AC: max 24h
    this.mfaPendingTtl = process.env.JWT_MFA_PENDING_TTL || '5m';
  }

  /**
   * Sign a JWT with HS256 + standard claims (iss, aud, jti).
   */
  sign(payload: Omit<JwtPayload, 'iat' | 'exp' | 'jti'>, options: SignOptions): string {
    const fullPayload: JwtPayload = {
      ...payload,
      type: options.type,
      jti: options.jti || crypto.randomBytes(16).toString('hex'),
    };

    return jwt.sign(fullPayload, this.secret, {
      algorithm: 'HS256',
      expiresIn: options.expiresIn,
      issuer: this.issuer,
      audience: this.audience,
    } as jwt.SignOptions);
  }

  /**
   * Issue an access token (short-lived, used in Authorization header).
   */
  signAccessToken(user: { id: string; tenant_id: string; role: JwtPayload['role']; email: string }): {
    token: string;
    expiresIn: number;
  } {
    const token = this.sign(
      {
        sub: user.id,
        tenant_id: user.tenant_id,
        role: user.role,
        email: user.email,
        type: 'access',
      },
      { expiresIn: this.accessTokenTtl, type: 'access' },
    );

    return { token, expiresIn: this.parseTtl(this.accessTokenTtl) };
  }

  /**
   * Issue a refresh token (longer-lived, max 24h). Returns the token plus
   * its `jti` so the caller can persist it (hashed) in refresh_tokens.
   */
  signRefreshToken(user: { id: string; tenant_id: string; role: JwtPayload['role']; email: string }): {
    token: string;
    jti: string;
    expiresIn: number;
  } {
    const jti = crypto.randomBytes(16).toString('hex');
    const token = this.sign(
      {
        sub: user.id,
        tenant_id: user.tenant_id,
        role: user.role,
        email: user.email,
        type: 'refresh',
      },
      { expiresIn: this.refreshTokenTtl, type: 'refresh', jti },
    );

    return { token, jti, expiresIn: this.parseTtl(this.refreshTokenTtl) };
  }

  /**
   * Issue an intermediate "mfa_pending" token: returned by /auth/login when
   * password is correct but MFA TOTP is still required. Cannot be used as
   * an access token — guards reject `type !== 'access'`.
   */
  signMfaPendingToken(user: { id: string; tenant_id: string; role: JwtPayload['role']; email: string }): string {
    return this.sign(
      {
        sub: user.id,
        tenant_id: user.tenant_id,
        role: user.role,
        email: user.email,
        type: 'mfa_pending',
      },
      { expiresIn: this.mfaPendingTtl, type: 'mfa_pending' },
    );
  }

  /**
   * Verify signature + claims. Throws UnauthorizedException on any failure
   * (expired, malformed, bad issuer/audience, wrong type).
   */
  verify<T extends JwtPayload['type'] = 'access'>(
    token: string,
    expectedType?: T,
  ): JwtPayload {
    try {
      const decoded = jwt.verify(token, this.secret, {
        algorithms: ['HS256'],
        issuer: this.issuer,
        audience: this.audience,
      }) as JwtPayload;

      if (expectedType && decoded.type !== expectedType) {
        throw new UnauthorizedException(
          `Invalid token type: expected ${expectedType}, got ${decoded.type}`,
        );
      }

      return decoded;
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      const reason =
        err instanceof jwt.TokenExpiredError
          ? 'Token expired'
          : err instanceof jwt.JsonWebTokenError
          ? 'Invalid token signature'
          : 'Token verification failed';
      throw new UnauthorizedException(reason);
    }
  }

  /**
   * Hash a refresh token for secure storage. We never store raw tokens in
   * the DB so a leaked dump cannot be replayed.
   */
  hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Parse a TTL string ("15m", "24h", "30s") into seconds. Used to populate
   * the `expires_in` field of the OAuth-style response.
   */
  private parseTtl(ttl: string | number): number {
    if (typeof ttl === 'number') return ttl;
    const match = /^(\d+)\s*([smhd])$/i.exec(ttl);
    if (!match) {
      throw new InternalServerErrorException(`Invalid TTL format: ${ttl}`);
    }
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * multipliers[unit];
  }
}
