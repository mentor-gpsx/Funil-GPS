import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

/**
 * bcrypt-backed password hashing. Cost factor 12 by default (2^12 ≈ 4k
 * iterations) — OWASP-recommended floor as of 2026.
 *
 * Why a dedicated service: keeps cost factor + algorithm in one place so
 * we can rotate (e.g. argon2) without touching every consumer.
 */
@Injectable()
export class PasswordService {
  private readonly costFactor: number;

  constructor() {
    const cf = parseInt(process.env.BCRYPT_COST || '12', 10);
    if (Number.isNaN(cf) || cf < 10 || cf > 15) {
      // Reject misconfiguration loudly; cost < 10 is too weak,
      // > 15 will starve event loop in production.
      throw new InternalServerErrorException(
        `BCRYPT_COST must be an integer between 10 and 15 (got ${process.env.BCRYPT_COST})`,
      );
    }
    this.costFactor = cf;
  }

  /**
   * Hash a plaintext password. Salt is generated internally per-call.
   */
  async hash(password: string): Promise<string> {
    if (!password || password.length < 8) {
      throw new InternalServerErrorException('Password must be at least 8 characters');
    }
    return bcrypt.hash(password, this.costFactor);
  }

  /**
   * Verify a plaintext password against a stored hash. Constant-time
   * comparison via bcrypt internals.
   *
   * Returns false (never throws) on bad input so callers can implement
   * a uniform "invalid credentials" error to avoid user enumeration.
   */
  async verify(password: string, hash: string): Promise<boolean> {
    if (!password || !hash) return false;
    try {
      return await bcrypt.compare(password, hash);
    } catch {
      return false;
    }
  }
}
