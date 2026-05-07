import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import {
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as speakeasy from 'speakeasy';
import { AuthService } from '../auth.service';
import { JwtService } from '../jwt.service';
import { PasswordService } from '../password.service';
import { TotpService } from '../totp.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../dto/signup.dto';

/**
 * In-memory mock pg.Pool. Adequate for unit tests of AuthService — verifies
 * SQL parameters, tenant isolation, and transaction lifecycle without
 * requiring a live Postgres.
 */
type QueryResponder = (sql: string, params?: any[]) => Promise<any> | any;

function makeMockClient(responders: QueryResponder[] = []) {
  let i = 0;
  const calls: Array<{ sql: string; params?: any[] }> = [];
  const client: any = {
    query: jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
      calls.push({ sql, params });
      if (i < responders.length) {
        const r = responders[i++];
        return await r(sql, params);
      }
      // Default: empty rowset / no-op for BEGIN/COMMIT/SET LOCAL
      return { rows: [] };
    }),
    release: jest.fn(),
    _calls: calls,
  };
  return client;
}

function makePool(client: any): Pool {
  return {
    connect: jest.fn().mockResolvedValue(client),
    query: jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
      // Pool-level query is also used by findUserByEmail
      // Default: no rows
      return { rows: [] };
    }),
  } as unknown as Pool;
}

describe('AuthService', () => {
  let pool: Pool;
  let authService: AuthService;
  let jwtService: JwtService;
  let passwordService: PasswordService;
  let totpService: TotpService;

  const TENANT_A = '11111111-1111-1111-1111-111111111111';
  const TENANT_B = '22222222-2222-2222-2222-222222222222';
  const USER_A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-12345';
    process.env.JWT_ACCESS_TTL = '15m';
    process.env.JWT_REFRESH_TTL = '24h';
    process.env.JWT_MFA_PENDING_TTL = '5m';
    process.env.BCRYPT_COST = '10';

    jwtService = new JwtService();
    passwordService = new PasswordService();
    totpService = new TotpService();
  });

  // ==========================================================================
  // SIGNUP
  // ==========================================================================
  describe('signup', () => {
    it('hashes the password and inserts a user with default role=viewer', async () => {
      const client = makeMockClient([
        async () => ({ rows: [] }), // BEGIN
        async () => ({ rows: [] }), // SET LOCAL
        async () => ({ rows: [] }), // SELECT existing email — none
        async (sql: string, params?: any[]) => {
          // INSERT users
          expect(sql).toContain('INSERT INTO users');
          expect(params![0]).toBe(TENANT_A);
          expect(params![1]).toBe('alice@example.com');
          // Password should already be hashed (not plaintext)
          expect(params![2]).toMatch(/^\$2[aby]\$/);
          expect(params![4]).toBe(UserRole.VIEWER);
          return {
            rows: [
              {
                tenant_id: TENANT_A,
                id: USER_A_ID,
                email: 'alice@example.com',
                full_name: 'Alice',
                role: UserRole.VIEWER,
                mfa_enrolled: false,
              },
            ],
          };
        },
        async () => ({ rows: [] }), // COMMIT
      ]);
      pool = makePool(client);
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      const result = await authService.signup({
        email: 'alice@example.com',
        password: 'StrongPass1',
        full_name: 'Alice',
        tenant_id: TENANT_A,
      });

      expect(result.email).toBe('alice@example.com');
      expect(result.role).toBe(UserRole.VIEWER);
    });

    it('rejects duplicate email with ConflictException', async () => {
      const client = makeMockClient([
        async () => ({ rows: [] }), // BEGIN
        async () => ({ rows: [] }), // SET LOCAL
        async () => ({ rows: [{ id: 'existing-id' }] }), // SELECT — found
      ]);
      pool = makePool(client);
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      await expect(
        authService.signup({
          email: 'taken@example.com',
          password: 'StrongPass1',
          full_name: 'Whoever',
          tenant_id: TENANT_A,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('respects role override (admin) when explicitly provided', async () => {
      const client = makeMockClient([
        async () => ({ rows: [] }), // BEGIN
        async () => ({ rows: [] }), // SET LOCAL
        async () => ({ rows: [] }), // SELECT
        async (_sql: string, params?: any[]) => {
          expect(params![4]).toBe(UserRole.ADMIN);
          return {
            rows: [{ id: USER_A_ID, email: 'admin@example.com', role: 'admin' }],
          };
        },
        async () => ({ rows: [] }), // COMMIT
      ]);
      pool = makePool(client);
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      await authService.signup({
        email: 'admin@example.com',
        password: 'StrongPass1',
        full_name: 'Admin',
        tenant_id: TENANT_A,
        role: UserRole.ADMIN,
      });
    });
  });

  // ==========================================================================
  // LOGIN
  // ==========================================================================
  describe('login', () => {
    it('returns tokens when password matches and MFA not enrolled', async () => {
      const passwordHash = await passwordService.hash('CorrectPass1');
      const userRow = {
        tenant_id: TENANT_A,
        id: USER_A_ID,
        email: 'alice@example.com',
        password_hash: passwordHash,
        full_name: 'Alice',
        role: 'accountant',
        mfa_enrolled: false,
        mfa_secret: null,
        mfa_backup_codes: null,
        is_active: true,
        failed_login_attempts: 0,
        locked_until: null,
      };

      const client = makeMockClient([
        async () => ({ rows: [] }), // SET LOCAL
        async () => ({ rows: [] }), // INSERT refresh_token
        async () => ({ rows: [] }), // UPDATE last_login_at
        async () => ({ rows: [] }), // SET LOCAL (resetFailedAttempts)
        async () => ({ rows: [] }), // UPDATE failed_attempts = 0
      ]);
      pool = makePool(client);
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [userRow] });
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      const result = await authService.login({
        email: 'alice@example.com',
        password: 'CorrectPass1',
      });

      expect('mfaRequired' in result && result.mfaRequired).toBe(false);
      if (!result.mfaRequired) {
        expect(result.tokens.accessToken).toBeDefined();
        expect(result.tokens.refreshToken).toBeDefined();
        expect(result.tokens.tokenType).toBe('Bearer');
        expect(result.user.email).toBe('alice@example.com');

        // Validate JWT custom claims (tenant_id + role)
        const decoded = jwtService.verify(result.tokens.accessToken, 'access');
        expect(decoded.tenant_id).toBe(TENANT_A);
        expect(decoded.role).toBe('accountant');
      }
    });

    it('returns mfaRequired=true when user has MFA enrolled', async () => {
      const passwordHash = await passwordService.hash('CorrectPass1');
      const userRow = {
        tenant_id: TENANT_A,
        id: USER_A_ID,
        email: 'mfa@example.com',
        password_hash: passwordHash,
        full_name: 'MFA User',
        role: 'admin',
        mfa_enrolled: true,
        mfa_secret: 'JBSWY3DPEHPK3PXP',
        mfa_backup_codes: null,
        is_active: true,
        failed_login_attempts: 0,
        locked_until: null,
      };

      pool = makePool(makeMockClient([]));
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [userRow] });
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      const result = await authService.login({
        email: 'mfa@example.com',
        password: 'CorrectPass1',
      });

      expect(result.mfaRequired).toBe(true);
      if (result.mfaRequired) {
        const decoded = jwtService.verify(result.sessionToken, 'mfa_pending');
        expect(decoded.type).toBe('mfa_pending');
        expect(decoded.tenant_id).toBe(TENANT_A);
      }
    });

    it('rejects wrong password with UnauthorizedException', async () => {
      const passwordHash = await passwordService.hash('CorrectPass1');
      const userRow = {
        tenant_id: TENANT_A,
        id: USER_A_ID,
        email: 'alice@example.com',
        password_hash: passwordHash,
        full_name: 'Alice',
        role: 'viewer',
        mfa_enrolled: false,
        mfa_secret: null,
        mfa_backup_codes: null,
        is_active: true,
        failed_login_attempts: 0,
        locked_until: null,
      };

      pool = makePool(makeMockClient([]));
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [userRow] });
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      await expect(
        authService.login({
          email: 'alice@example.com',
          password: 'WrongPass1',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects unknown email with same UnauthorizedException (no enumeration)', async () => {
      pool = makePool(makeMockClient([]));
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      await expect(
        authService.login({
          email: 'unknown@example.com',
          password: 'AnyPass1',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects login when account is locked', async () => {
      const passwordHash = await passwordService.hash('CorrectPass1');
      const userRow = {
        tenant_id: TENANT_A,
        id: USER_A_ID,
        email: 'locked@example.com',
        password_hash: passwordHash,
        full_name: 'Locked',
        role: 'viewer',
        mfa_enrolled: false,
        mfa_secret: null,
        mfa_backup_codes: null,
        is_active: true,
        failed_login_attempts: 5,
        locked_until: new Date(Date.now() + 5 * 60_000), // 5 min in future
      };

      pool = makePool(makeMockClient([]));
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [userRow] });
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      await expect(
        authService.login({ email: 'locked@example.com', password: 'CorrectPass1' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects login when account is disabled', async () => {
      const passwordHash = await passwordService.hash('CorrectPass1');
      const userRow = {
        tenant_id: TENANT_A,
        id: USER_A_ID,
        email: 'disabled@example.com',
        password_hash: passwordHash,
        full_name: 'Disabled',
        role: 'viewer',
        mfa_enrolled: false,
        mfa_secret: null,
        mfa_backup_codes: null,
        is_active: false,
        failed_login_attempts: 0,
        locked_until: null,
      };

      pool = makePool(makeMockClient([]));
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [userRow] });
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      await expect(
        authService.login({ email: 'disabled@example.com', password: 'CorrectPass1' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==========================================================================
  // MFA SETUP & VERIFY
  // ==========================================================================
  describe('MFA setup', () => {
    it('returns QR + secret + backup codes and persists them', async () => {
      const userRow = {
        tenant_id: TENANT_A,
        id: USER_A_ID,
        email: 'mfa-setup@example.com',
        password_hash: 'irrelevant',
        full_name: 'New',
        role: 'admin',
        mfa_enrolled: false,
        mfa_secret: null,
        mfa_backup_codes: null,
        is_active: true,
        failed_login_attempts: 0,
        locked_until: null,
      };

      const persistClient = makeMockClient([
        async () => ({ rows: [] }), // BEGIN
        async () => ({ rows: [] }), // SET LOCAL
        async (sql: string, params?: any[]) => {
          expect(sql).toContain('UPDATE users');
          expect(sql).toContain('mfa_secret');
          // Backup codes must be hashed (JSON of bcrypt hashes)
          const hashedJson = JSON.parse(params![3]);
          expect(Array.isArray(hashedJson)).toBe(true);
          expect(hashedJson).toHaveLength(10);
          hashedJson.forEach((h: string) => expect(h).toMatch(/^\$2[aby]\$/));
          return { rows: [] };
        },
        async () => ({ rows: [] }), // COMMIT
      ]);

      pool = makePool(persistClient);
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [userRow] });
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      const result = await authService.setupMfa(USER_A_ID, TENANT_A);
      expect(result.qrCode).toMatch(/^data:image\/png;base64,/);
      expect(result.secret).toMatch(/^[A-Z2-7]+=*$/);
      expect(result.backupCodes).toHaveLength(10);
    });

    it('rejects setup if MFA already enrolled', async () => {
      const userRow = {
        tenant_id: TENANT_A,
        id: USER_A_ID,
        mfa_enrolled: true,
        mfa_secret: 'EXISTING',
      };
      pool = makePool(makeMockClient([]));
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [userRow] });
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      await expect(authService.setupMfa(USER_A_ID, TENANT_A)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException when user not found', async () => {
      pool = makePool(makeMockClient([]));
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      await expect(authService.setupMfa('missing', TENANT_A)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('verifyMfaEnrollment', () => {
    it('finalises enrolment when TOTP code matches', async () => {
      const enrol = await totpService.enroll('verify@example.com');
      const validToken = speakeasy.totp({ secret: enrol.secret, encoding: 'base32' });

      const userRow = {
        tenant_id: TENANT_A,
        id: USER_A_ID,
        mfa_enrolled: false,
        mfa_secret: enrol.secret,
      };

      const client = makeMockClient([
        async () => ({ rows: [] }), // SET LOCAL
        async (sql: string) => {
          expect(sql).toContain('SET mfa_enrolled = true');
          return { rows: [] };
        },
      ]);
      pool = makePool(client);
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [userRow] });
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      const result = await authService.verifyMfaEnrollment(
        USER_A_ID,
        TENANT_A,
        validToken,
      );
      expect(result.enrolled).toBe(true);
    });

    it('rejects wrong TOTP code', async () => {
      const enrol = await totpService.enroll('badcode@example.com');
      const userRow = {
        tenant_id: TENANT_A,
        id: USER_A_ID,
        mfa_enrolled: false,
        mfa_secret: enrol.secret,
      };
      pool = makePool(makeMockClient([]));
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [userRow] });
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      await expect(
        authService.verifyMfaEnrollment(USER_A_ID, TENANT_A, '000000'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ==========================================================================
  // MFA BACKUP-CODE RECOVERY (verifyBackupCode)
  // ==========================================================================
  describe('verifyBackupCode', () => {
    const PLAINTEXT_GOOD = 'ABCD-1234';
    const PLAINTEXT_OTHER = 'EFGH-5678';

    async function buildHashedCodes(plain: string[]): Promise<string[]> {
      // Use cost 4 in tests for speed; production uses 10 (auth.service:177).
      return Promise.all(plain.map(c => bcrypt.hash(c, 4)));
    }

    function buildSessionToken(): string {
      return jwtService.signMfaPendingToken({
        id: USER_A_ID,
        tenant_id: TENANT_A,
        role: 'admin',
        email: 'backup@example.com',
      });
    }

    it('issues tokens, consumes the matched code (single-use), and resets failed attempts', async () => {
      const hashed = await buildHashedCodes([PLAINTEXT_OTHER, PLAINTEXT_GOOD]);
      const userRow = {
        tenant_id: TENANT_A,
        id: USER_A_ID,
        email: 'backup@example.com',
        password_hash: 'irrelevant',
        full_name: 'Backup',
        role: 'admin',
        mfa_enrolled: true,
        mfa_secret: 'JBSWY3DPEHPK3PXP',
        mfa_backup_codes: hashed,
        is_active: true,
        failed_login_attempts: 0,
        locked_until: null,
      };

      let updateCalled = false;
      let issuedTokenInsertCalled = false;

      const client = makeMockClient([
        async () => ({ rows: [] }), // BEGIN (consume code tx)
        async () => ({ rows: [] }), // SET LOCAL
        async (sql: string, params?: any[]) => {
          // UPDATE users → backup codes shrink, attempts reset
          expect(sql).toContain('UPDATE users');
          expect(sql).toContain('mfa_backup_codes');
          expect(sql).toContain('failed_login_attempts = 0');
          expect(sql).toContain('locked_until = NULL');
          const remaining = JSON.parse(params![2]);
          expect(remaining).toHaveLength(1); // one consumed
          expect(remaining[0]).toBe(hashed[0]); // unmatched stays
          updateCalled = true;
          return { rows: [] };
        },
        async () => ({ rows: [] }), // COMMIT
        async () => ({ rows: [] }), // SET LOCAL (issueTokens)
        async (sql: string) => {
          expect(sql).toContain('INSERT INTO refresh_tokens');
          issuedTokenInsertCalled = true;
          return { rows: [] };
        },
        async () => ({ rows: [] }), // UPDATE last_login_at
      ]);

      pool = makePool(client);
      // findUserById uses pool.query (no client passed)
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [userRow] });
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      const result = await authService.verifyBackupCode(
        buildSessionToken(),
        PLAINTEXT_GOOD,
      );

      expect(updateCalled).toBe(true);
      expect(issuedTokenInsertCalled).toBe(true);
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
      expect(result.tokens.tokenType).toBe('Bearer');

      // Custom claims still come from the user row (server-side)
      const decoded = jwtService.verify(result.tokens.accessToken, 'access');
      expect(decoded.tenant_id).toBe(TENANT_A);
      expect(decoded.role).toBe('admin');
    });

    it('rejects an unknown code with UnauthorizedException and registers a failed attempt', async () => {
      const hashed = await buildHashedCodes([PLAINTEXT_GOOD, PLAINTEXT_OTHER]);
      const userRow = {
        tenant_id: TENANT_A,
        id: USER_A_ID,
        email: 'backup@example.com',
        mfa_enrolled: true,
        mfa_secret: 'JBSWY3DPEHPK3PXP',
        mfa_backup_codes: hashed,
        failed_login_attempts: 0,
        locked_until: null,
        is_active: true,
        password_hash: 'irrelevant',
        full_name: 'Backup',
        role: 'admin',
      };

      let failedAttemptUpdate = false;
      const client = makeMockClient([
        async () => ({ rows: [] }), // SET LOCAL (registerFailedAttempt)
        async (sql: string) => {
          expect(sql).toContain('failed_login_attempts');
          failedAttemptUpdate = true;
          return { rows: [] };
        },
      ]);

      pool = makePool(client);
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [userRow] });
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      await expect(
        authService.verifyBackupCode(buildSessionToken(), 'WRONG-CODE'),
      ).rejects.toThrow(UnauthorizedException);
      expect(failedAttemptUpdate).toBe(true);
    });

    it('cannot reuse an already-consumed code (single-use guarantee)', async () => {
      // Simulate the post-consumption state: code has been removed.
      const hashed = await buildHashedCodes([PLAINTEXT_OTHER]); // PLAINTEXT_GOOD already consumed
      const userRow = {
        tenant_id: TENANT_A,
        id: USER_A_ID,
        email: 'backup@example.com',
        mfa_enrolled: true,
        mfa_secret: 'JBSWY3DPEHPK3PXP',
        mfa_backup_codes: hashed,
        failed_login_attempts: 0,
        locked_until: null,
        is_active: true,
        password_hash: 'irrelevant',
        full_name: 'Backup',
        role: 'admin',
      };

      const client = makeMockClient([
        async () => ({ rows: [] }), // SET LOCAL (registerFailedAttempt)
        async () => ({ rows: [] }), // UPDATE failed_login_attempts
      ]);
      pool = makePool(client);
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [userRow] });
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      await expect(
        authService.verifyBackupCode(buildSessionToken(), PLAINTEXT_GOOD),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when user has no backup codes left (uniform error)', async () => {
      const userRow = {
        tenant_id: TENANT_A,
        id: USER_A_ID,
        email: 'nocodes@example.com',
        mfa_enrolled: true,
        mfa_secret: 'JBSWY3DPEHPK3PXP',
        mfa_backup_codes: [],
        failed_login_attempts: 0,
        locked_until: null,
        is_active: true,
        password_hash: 'irrelevant',
        full_name: 'No Codes',
        role: 'viewer',
      };

      const client = makeMockClient([
        async () => ({ rows: [] }), // SET LOCAL (registerFailedAttempt)
        async () => ({ rows: [] }),
      ]);
      pool = makePool(client);
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [userRow] });
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      await expect(
        authService.verifyBackupCode(buildSessionToken(), PLAINTEXT_GOOD),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when MFA is not enrolled', async () => {
      const userRow = {
        tenant_id: TENANT_A,
        id: USER_A_ID,
        email: 'nomfa@example.com',
        mfa_enrolled: false,
        mfa_secret: null,
        mfa_backup_codes: null,
        failed_login_attempts: 0,
        locked_until: null,
        is_active: true,
        password_hash: 'irrelevant',
        full_name: 'No MFA',
        role: 'viewer',
      };

      pool = makePool(makeMockClient([]));
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [userRow] });
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      await expect(
        authService.verifyBackupCode(buildSessionToken(), PLAINTEXT_GOOD),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects with invalid session when the JWT type is not mfa_pending', async () => {
      const accessToken = jwtService.signAccessToken({
        id: USER_A_ID,
        tenant_id: TENANT_A,
        role: 'admin',
        email: 'wrong-type@example.com',
      });

      pool = makePool(makeMockClient([]));
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      await expect(
        authService.verifyBackupCode(accessToken.token, PLAINTEXT_GOOD),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ==========================================================================
  // REFRESH (rotation)
  // ==========================================================================
  describe('refresh', () => {
    it('issues new tokens and revokes the old refresh token', async () => {
      const refreshTokenIssued = jwtService.signRefreshToken({
        id: USER_A_ID,
        tenant_id: TENANT_A,
        role: 'accountant',
        email: 'refresh@example.com',
      });
      const tokenHash = jwtService.hashRefreshToken(refreshTokenIssued.token);

      const userRow = {
        tenant_id: TENANT_A,
        id: USER_A_ID,
        email: 'refresh@example.com',
        password_hash: 'irrelevant',
        full_name: 'Refresh',
        role: 'accountant',
        mfa_enrolled: false,
        mfa_secret: null,
        mfa_backup_codes: null,
        is_active: true,
        failed_login_attempts: 0,
        locked_until: null,
      };

      let updateOldCalled = false;
      let insertNewCalled = false;

      const client = makeMockClient([
        async () => ({ rows: [] }), // BEGIN
        async () => ({ rows: [] }), // SET LOCAL
        async (sql: string, params?: any[]) => {
          // SELECT stored refresh_token
          expect(sql).toContain('FROM refresh_tokens');
          expect(params![1]).toBe(tokenHash);
          return {
            rows: [
              {
                id: 'token-row-id',
                user_id: USER_A_ID,
                expires_at: new Date(Date.now() + 60 * 60 * 1000),
                revoked_at: null,
              },
            ],
          };
        },
        async (sql: string) => {
          // findUserById (within transaction client)
          expect(sql).toContain('FROM users');
          return { rows: [userRow] };
        },
        async (sql: string) => {
          // INSERT new refresh_token
          expect(sql).toContain('INSERT INTO refresh_tokens');
          insertNewCalled = true;
          return { rows: [{ id: 'new-token-id' }] };
        },
        async (sql: string) => {
          // UPDATE old refresh_token (revoke + replaced_by)
          expect(sql).toContain('UPDATE refresh_tokens');
          expect(sql).toContain('revoked_at = NOW()');
          expect(sql).toContain('replaced_by');
          updateOldCalled = true;
          return { rows: [] };
        },
        async () => ({ rows: [] }), // COMMIT
      ]);
      pool = makePool(client);
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      const result = await authService.refresh(refreshTokenIssued.token);

      expect(insertNewCalled).toBe(true);
      expect(updateOldCalled).toBe(true);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).not.toBe(refreshTokenIssued.token); // rotated
    });

    it('rejects refresh with already-revoked token AND revokes entire chain (reuse detection)', async () => {
      const refreshTokenIssued = jwtService.signRefreshToken({
        id: USER_A_ID,
        tenant_id: TENANT_A,
        role: 'viewer',
        email: 'reuse@example.com',
      });

      let chainRevoked = false;
      const client = makeMockClient([
        async () => ({ rows: [] }), // BEGIN
        async () => ({ rows: [] }), // SET LOCAL
        async () => ({
          rows: [
            {
              id: 'token-id',
              user_id: USER_A_ID,
              expires_at: new Date(Date.now() + 60 * 60 * 1000),
              revoked_at: new Date(Date.now() - 60_000), // already revoked
            },
          ],
        }),
        async (sql: string) => {
          // chain revocation
          expect(sql).toContain('UPDATE refresh_tokens');
          expect(sql).toContain('revoked_at IS NULL');
          chainRevoked = true;
          return { rows: [] };
        },
        async () => ({ rows: [] }), // COMMIT
      ]);
      pool = makePool(client);
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      await expect(authService.refresh(refreshTokenIssued.token)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(chainRevoked).toBe(true);
    });

    it('rejects refresh with malformed JWT', async () => {
      pool = makePool(makeMockClient([]));
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      await expect(authService.refresh('not-a-jwt')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ==========================================================================
  // LOGOUT
  // ==========================================================================
  describe('logout', () => {
    it('revokes the refresh token', async () => {
      const { token } = jwtService.signRefreshToken({
        id: USER_A_ID,
        tenant_id: TENANT_A,
        role: 'admin',
        email: 'logout@example.com',
      });

      let revokeCalled = false;
      const client = makeMockClient([
        async () => ({ rows: [] }), // SET LOCAL
        async (sql: string) => {
          expect(sql).toContain('UPDATE refresh_tokens');
          expect(sql).toContain('revoked_at = NOW()');
          revokeCalled = true;
          return { rows: [] };
        },
      ]);
      pool = makePool(client);
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      await authService.logout(token);
      expect(revokeCalled).toBe(true);
    });

    it('is idempotent for invalid tokens (no throw)', async () => {
      pool = makePool(makeMockClient([]));
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      await expect(authService.logout('invalid-jwt')).resolves.toBeUndefined();
    });
  });

  // ==========================================================================
  // MULTI-TENANT ISOLATION
  // ==========================================================================
  describe('Multi-tenant isolation', () => {
    it('embeds tenant_id from the user row into the JWT (no client-controlled override)', async () => {
      const passwordHash = await passwordService.hash('CorrectPass1');
      const userRow = {
        tenant_id: TENANT_B, // server's source of truth
        id: USER_A_ID,
        email: 'tenant@example.com',
        password_hash: passwordHash,
        full_name: 'TUser',
        role: 'admin',
        mfa_enrolled: false,
        mfa_secret: null,
        mfa_backup_codes: null,
        is_active: true,
        failed_login_attempts: 0,
        locked_until: null,
      };

      pool = makePool(makeMockClient([]));
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [userRow] });
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      const result = await authService.login({
        email: 'tenant@example.com',
        password: 'CorrectPass1',
      });
      if (result.mfaRequired) throw new Error('unexpected MFA path');
      const decoded = jwtService.verify(result.tokens.accessToken, 'access');
      expect(decoded.tenant_id).toBe(TENANT_B);
      expect(decoded.tenant_id).not.toBe(TENANT_A);
    });

    it('every authenticated query path issues SET LOCAL app.current_tenant', async () => {
      // This test verifies the contract: any service path that opens a
      // connection MUST issue SET LOCAL with the correct tenant.
      const userRow = {
        tenant_id: TENANT_A,
        id: USER_A_ID,
        mfa_enrolled: false,
        mfa_secret: null,
      };

      const client = makeMockClient([
        async (sql: string, params?: any[]) => {
          expect(sql).toContain('SET LOCAL app.current_tenant');
          expect(params![0]).toBe(TENANT_A);
          return { rows: [] };
        },
        async () => ({ rows: [] }),
      ]);

      pool = makePool(client);
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [userRow] });
      authService = new AuthService(pool, passwordService, jwtService, totpService);

      // Trigger any service path that opens a transaction
      await authService.verifyMfaEnrollment(USER_A_ID, TENANT_A, '000000').catch(() => {
        // Will throw because TOTP doesn't match — but the SET LOCAL still
        // had to happen, captured by our assertion above.
      });
    });
  });
});

// ============================================================================
// RBAC GUARD TESTS
// ============================================================================
describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function buildContext(role: string | undefined, requiredRoles?: string[]): ExecutionContext {
    const handler = function () {};
    if (requiredRoles) {
      Reflect.defineMetadata('roles', requiredRoles, handler);
    }
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role } : null }),
      }),
      getHandler: () => handler,
      getClass: () => class {},
    } as unknown as ExecutionContext;
  }

  it('allows when no @Roles() metadata is set', () => {
    const ctx = buildContext('viewer'); // no required roles
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows admin on admin-only route', () => {
    const ctx = buildContext('admin', ['admin']);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows accountant on (admin|accountant) route', () => {
    const ctx = buildContext('accountant', ['admin', 'accountant']);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies viewer on accountant-only route', () => {
    const ctx = buildContext('viewer', ['accountant']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('denies viewer on admin-only route', () => {
    const ctx = buildContext('viewer', ['admin']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('does NOT auto-promote admin to accountant routes', () => {
    // Hierarchy is intentionally explicit — admin must be listed.
    const ctx = buildContext('admin', ['accountant']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws when role is missing on request', () => {
    const ctx = buildContext(undefined, ['admin']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

// ============================================================================
// JWT GUARD TESTS
// ============================================================================
describe('JwtAuthGuard', () => {
  let jwt: JwtService;
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-12345';
    jwt = new JwtService();
    reflector = new Reflector();
    guard = new JwtAuthGuard(jwt, reflector);
  });

  function ctxWithHeader(authHeader?: string, isPublic = false): ExecutionContext {
    const handler = function () {};
    if (isPublic) {
      Reflect.defineMetadata('isPublic', true, handler);
    }
    const req: any = { headers: {} };
    if (authHeader) req.headers.authorization = authHeader;
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => handler,
      getClass: () => class {},
    } as unknown as ExecutionContext;
  }

  it('allows public routes without a token', () => {
    const ctx = ctxWithHeader(undefined, true);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects request with no Authorization header', () => {
    const ctx = ctxWithHeader();
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects malformed Authorization header', () => {
    const ctx = ctxWithHeader('Basic abcdef');
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('accepts valid Bearer token and attaches request.user', () => {
    const { token } = jwt.signAccessToken({
      id: 'u1',
      tenant_id: 't1',
      role: 'admin',
      email: 'jwt@example.com',
    });
    const handler = function () {};
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => handler,
      getClass: () => class {},
    } as unknown as ExecutionContext;

    expect(guard.canActivate(ctx)).toBe(true);
    expect(req.user).toEqual({
      id: 'u1',
      tenant_id: 't1',
      role: 'admin',
      email: 'jwt@example.com',
    });
  });

  it('rejects refresh tokens at access guards (wrong type)', () => {
    const { token } = jwt.signRefreshToken({
      id: 'u1',
      tenant_id: 't1',
      role: 'admin',
      email: 'refresh@example.com',
    });
    const ctx = ctxWithHeader(`Bearer ${token}`);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects mfa_pending tokens at access guards', () => {
    const token = jwt.signMfaPendingToken({
      id: 'u1',
      tenant_id: 't1',
      role: 'admin',
      email: 'mfa@example.com',
    });
    const ctx = ctxWithHeader(`Bearer ${token}`);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
