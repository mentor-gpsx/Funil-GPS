import { Injectable, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';

export interface TotpEnrollment {
  secret: string; // Base32 — store on user, return to client ONCE
  otpauthUrl: string;
  qrCode: string; // data:image/png;base64,...
  backupCodes: string[]; // 10 plaintext codes — return ONCE, store hashed
}

/**
 * RFC 6238 TOTP service backed by `speakeasy`.
 *
 * Why centralise: keeps issuer + window + digit count consistent. Frontend
 * receives only public artefacts (otpauth URL + QR PNG); secret is stored
 * server-side and re-used for every verification.
 */
@Injectable()
export class TotpService {
  private readonly issuer: string;
  private readonly window: number;
  private readonly digits: number;

  constructor() {
    this.issuer = process.env.TOTP_ISSUER || 'Funil GPS ERP';
    // window=1 → ±30s clock-skew tolerance (one step before / one after)
    this.window = parseInt(process.env.TOTP_WINDOW || '1', 10);
    this.digits = parseInt(process.env.TOTP_DIGITS || '6', 10);
  }

  /**
   * Generate a new TOTP secret + QR code + backup codes.
   * Caller must persist the secret + bcrypt-hashed backup codes.
   */
  async enroll(accountLabel: string): Promise<TotpEnrollment> {
    if (!accountLabel) {
      throw new BadRequestException('accountLabel is required for TOTP enrolment');
    }

    const secretObj = speakeasy.generateSecret({
      name: `${this.issuer}:${accountLabel}`,
      issuer: this.issuer,
      length: 20, // 160-bit secret per RFC 4226
    });

    let otpauthUrl = secretObj.otpauth_url || '';
    // Ensure issuer is in the URL (some versions of speakeasy may not include it)
    if (!otpauthUrl.includes('issuer=')) {
      const separator = otpauthUrl.includes('?') ? '&' : '?';
      otpauthUrl += `${separator}issuer=${encodeURIComponent(this.issuer)}`;
    }
    const qrCode = await qrcode.toDataURL(otpauthUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 240,
    });

    const backupCodes = this.generateBackupCodes(10);

    return {
      secret: secretObj.base32,
      otpauthUrl,
      qrCode,
      backupCodes,
    };
  }

  /**
   * Verify a 6-digit token against a stored secret. Returns true on match
   * (within the configured window), false otherwise.
   *
   * NOTE: caller should rate-limit calls to this method to prevent
   * brute-forcing the 6-digit space.
   */
  verify(secret: string, token: string): boolean {
    if (!secret || !token) return false;
    if (!/^\d{6}$/.test(token)) return false;

    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: this.window,
      digits: this.digits,
    });
  }

  /**
   * Generate N cryptographically-random backup codes.
   * Format: XXXX-XXXX (8 hex chars + dash, 10 chars total).
   */
  generateBackupCodes(count: number): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
    }
    return codes;
  }
}
