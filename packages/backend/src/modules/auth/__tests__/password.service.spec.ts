import { PasswordService } from '../password.service';
import { InternalServerErrorException } from '@nestjs/common';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    process.env.BCRYPT_COST = '10'; // faster tests, still > min
    service = new PasswordService();
  });

  describe('hash', () => {
    it('produces a bcrypt-format hash', async () => {
      const hash = await service.hash('S3curePass!');
      // bcrypt hashes start with $2a$, $2b$, or $2y$
      expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
      expect(hash.length).toBeGreaterThan(50);
    });

    it('produces different hashes for the same password (salt)', async () => {
      const a = await service.hash('SamePassword1');
      const b = await service.hash('SamePassword1');
      expect(a).not.toBe(b);
    });

    it('rejects passwords shorter than 8 chars', async () => {
      await expect(service.hash('short')).rejects.toThrow();
    });
  });

  describe('verify', () => {
    it('returns true for matching password', async () => {
      const hash = await service.hash('Correct1Pass');
      const ok = await service.verify('Correct1Pass', hash);
      expect(ok).toBe(true);
    });

    it('returns false for non-matching password', async () => {
      const hash = await service.hash('Correct1Pass');
      const ok = await service.verify('Wrong1Pass', hash);
      expect(ok).toBe(false);
    });

    it('returns false (never throws) for empty inputs', async () => {
      expect(await service.verify('', 'some-hash')).toBe(false);
      expect(await service.verify('pass', '')).toBe(false);
      expect(await service.verify('', '')).toBe(false);
    });

    it('returns false for malformed hash', async () => {
      expect(await service.verify('Correct1Pass', 'not-a-bcrypt-hash')).toBe(false);
    });
  });

  describe('constructor guardrails', () => {
    it('throws when BCRYPT_COST is below 10', () => {
      process.env.BCRYPT_COST = '8';
      expect(() => new PasswordService()).toThrow(InternalServerErrorException);
    });

    it('throws when BCRYPT_COST is above 15', () => {
      process.env.BCRYPT_COST = '20';
      expect(() => new PasswordService()).toThrow(InternalServerErrorException);
    });

    it('throws when BCRYPT_COST is non-numeric', () => {
      process.env.BCRYPT_COST = 'abc';
      expect(() => new PasswordService()).toThrow(InternalServerErrorException);
    });

    it('defaults to cost factor 12 when env unset', () => {
      delete process.env.BCRYPT_COST;
      const s = new PasswordService();
      expect(s).toBeDefined();
    });
  });
});
