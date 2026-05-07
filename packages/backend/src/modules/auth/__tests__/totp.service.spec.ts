import { TotpService } from '../totp.service';
import * as speakeasy from 'speakeasy';
import { BadRequestException } from '@nestjs/common';

describe('TotpService', () => {
  let service: TotpService;

  beforeEach(() => {
    delete process.env.TOTP_ISSUER;
    delete process.env.TOTP_WINDOW;
    delete process.env.TOTP_DIGITS;
    service = new TotpService();
  });

  describe('enroll', () => {
    it('returns a base32 secret + otpauth URL + QR + backup codes', async () => {
      const enrolment = await service.enroll('alice@example.com');
      expect(enrolment.secret).toMatch(/^[A-Z2-7]+=*$/); // base32 charset
      expect(enrolment.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
      expect(enrolment.qrCode).toMatch(/^data:image\/png;base64,/);
      expect(enrolment.backupCodes).toHaveLength(10);
    });

    it('embeds the issuer in the otpauth URL', async () => {
      const enrolment = await service.enroll('bob@example.com');
      expect(enrolment.otpauthUrl).toContain('issuer=');
    });

    it('rejects empty account label', async () => {
      await expect(service.enroll('')).rejects.toThrow(BadRequestException);
    });
  });

  describe('verify', () => {
    it('accepts a valid TOTP for the secret', async () => {
      const enrolment = await service.enroll('charlie@example.com');
      const liveToken = speakeasy.totp({
        secret: enrolment.secret,
        encoding: 'base32',
      });
      expect(service.verify(enrolment.secret, liveToken)).toBe(true);
    });

    it('rejects a TOTP from a different secret', async () => {
      const a = await service.enroll('a@example.com');
      const b = await service.enroll('b@example.com');
      const tokenForB = speakeasy.totp({
        secret: b.secret,
        encoding: 'base32',
      });
      expect(service.verify(a.secret, tokenForB)).toBe(false);
    });

    it('rejects non-numeric tokens', () => {
      expect(service.verify('JBSWY3DPEHPK3PXP', 'abcdef')).toBe(false);
    });

    it('rejects tokens with wrong digit count', () => {
      expect(service.verify('JBSWY3DPEHPK3PXP', '12345')).toBe(false);
      expect(service.verify('JBSWY3DPEHPK3PXP', '1234567')).toBe(false);
    });

    it('returns false on empty inputs', () => {
      expect(service.verify('', '123456')).toBe(false);
      expect(service.verify('SECRET', '')).toBe(false);
    });
  });

  describe('generateBackupCodes', () => {
    it('generates the requested count of codes', () => {
      const codes = service.generateBackupCodes(5);
      expect(codes).toHaveLength(5);
      codes.forEach(code => {
        expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
      });
    });

    it('generates unique codes', () => {
      const codes = service.generateBackupCodes(20);
      const unique = new Set(codes);
      expect(unique.size).toBe(20);
    });
  });
});
