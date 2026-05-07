import { JwtService } from '../jwt.service';
import { UnauthorizedException, InternalServerErrorException } from '@nestjs/common';

describe('JwtService', () => {
  let service: JwtService;
  const baseUser = {
    id: 'user-1',
    tenant_id: 'tenant-aaa',
    role: 'accountant' as const,
    email: 'alice@example.com',
  };

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-12345';
    process.env.JWT_ISSUER = 'test-issuer';
    process.env.JWT_AUDIENCE = 'test-aud';
    process.env.JWT_ACCESS_TTL = '15m';
    process.env.JWT_REFRESH_TTL = '24h';
    process.env.JWT_MFA_PENDING_TTL = '5m';
    service = new JwtService();
  });

  describe('signAccessToken', () => {
    it('issues a verifiable access token with custom claims', () => {
      const { token, expiresIn } = service.signAccessToken(baseUser);
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT has 3 segments
      expect(expiresIn).toBe(15 * 60);

      const decoded = service.verify(token, 'access');
      expect(decoded.sub).toBe('user-1');
      expect(decoded.tenant_id).toBe('tenant-aaa');
      expect(decoded.role).toBe('accountant');
      expect(decoded.email).toBe('alice@example.com');
      expect(decoded.type).toBe('access');
    });
  });

  describe('signRefreshToken', () => {
    it('returns token + jti + expiresIn (24h)', () => {
      const { token, jti, expiresIn } = service.signRefreshToken(baseUser);
      expect(token).toBeDefined();
      expect(jti).toMatch(/^[a-f0-9]{32}$/);
      expect(expiresIn).toBe(24 * 3600);

      const decoded = service.verify(token, 'refresh');
      expect(decoded.type).toBe('refresh');
      expect(decoded.jti).toBe(jti);
    });
  });

  describe('signMfaPendingToken', () => {
    it('issues an mfa_pending token that cannot be used as access', () => {
      const token = service.signMfaPendingToken(baseUser);
      const decoded = service.verify(token, 'mfa_pending');
      expect(decoded.type).toBe('mfa_pending');

      // Should reject when verifying as access
      expect(() => service.verify(token, 'access')).toThrow(UnauthorizedException);
    });
  });

  describe('verify', () => {
    it('rejects expired tokens', () => {
      process.env.JWT_ACCESS_TTL = '1s';
      const shortLived = new JwtService();
      const { token } = shortLived.signAccessToken(baseUser);

      // Wait for expiration (1 second + buffer)
      return new Promise<void>(resolve => {
        setTimeout(() => {
          expect(() => shortLived.verify(token)).toThrow(UnauthorizedException);
          resolve();
        }, 1100);
      });
    }, 3000);

    it('rejects malformed tokens', () => {
      expect(() => service.verify('not-a-jwt')).toThrow(UnauthorizedException);
      expect(() => service.verify('a.b.c')).toThrow(UnauthorizedException);
    });

    it('rejects tokens signed with a different secret', () => {
      const { token } = service.signAccessToken(baseUser);
      process.env.JWT_SECRET = 'different-secret-different-secret-12345';
      const otherService = new JwtService();
      expect(() => otherService.verify(token)).toThrow(UnauthorizedException);
    });

    it('rejects token with wrong issuer/audience', () => {
      const { token } = service.signAccessToken(baseUser);
      process.env.JWT_ISSUER = 'evil-issuer';
      const otherService = new JwtService();
      expect(() => otherService.verify(token)).toThrow(UnauthorizedException);
    });
  });

  describe('hashRefreshToken', () => {
    it('produces stable SHA-256 hex digest', () => {
      const a = service.hashRefreshToken('refresh-xyz');
      const b = service.hashRefreshToken('refresh-xyz');
      expect(a).toBe(b);
      expect(a).toMatch(/^[a-f0-9]{64}$/);
    });

    it('different inputs yield different hashes', () => {
      const a = service.hashRefreshToken('one');
      const b = service.hashRefreshToken('two');
      expect(a).not.toBe(b);
    });
  });

  describe('production guardrails', () => {
    it('throws if JWT_SECRET is missing in production', () => {
      const original = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      try {
        expect(() => new JwtService()).toThrow(InternalServerErrorException);
      } finally {
        process.env.NODE_ENV = original;
      }
    });
  });
});
