"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const bcrypt = __importStar(require("bcrypt"));
const password_service_1 = require("./password.service");
const jwt_service_1 = require("./jwt.service");
const totp_service_1 = require("./totp.service");
const signup_dto_1 = require("./dto/signup.dto");
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
let AuthService = class AuthService {
    pool;
    passwordService;
    jwtService;
    totpService;
    constructor(pool, passwordService, jwtService, totpService) {
        this.pool = pool;
        this.passwordService = passwordService;
        this.jwtService = jwtService;
        this.totpService = totpService;
    }
    async signup(dto) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SET LOCAL app.current_tenant = $1', [dto.tenant_id]);
            const existing = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [dto.email]);
            if (existing.rows.length > 0) {
                throw new common_1.ConflictException('Email already registered');
            }
            const passwordHash = await this.passwordService.hash(dto.password);
            const role = dto.role || signup_dto_1.UserRole.VIEWER;
            const result = await client.query(`INSERT INTO users (tenant_id, email, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING tenant_id, id, email, full_name, role, mfa_enrolled`, [dto.tenant_id, dto.email.toLowerCase(), passwordHash, dto.full_name, role]);
            await client.query('COMMIT');
            return result.rows[0];
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    async login(dto, metadata = {}) {
        const user = await this.findUserByEmail(dto.email);
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        if (!user.is_active) {
            throw new common_1.ForbiddenException('Account disabled');
        }
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            throw new common_1.ForbiddenException('Account temporarily locked. Try again later.');
        }
        const passwordOk = await this.passwordService.verify(dto.password, user.password_hash);
        if (!passwordOk) {
            await this.registerFailedAttempt(user);
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        if (user.mfa_enrolled && user.mfa_secret) {
            if (dto.totp) {
                const totpOk = this.totpService.verify(user.mfa_secret, dto.totp);
                if (!totpOk) {
                    await this.registerFailedAttempt(user);
                    throw new common_1.UnauthorizedException('Invalid credentials');
                }
            }
            else {
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
    async setupMfa(userId, tenantId) {
        const user = await this.findUserById(tenantId, userId);
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (user.mfa_enrolled) {
            throw new common_1.ConflictException('MFA already enrolled. Disable first to re-enrol.');
        }
        const enrollment = await this.totpService.enroll(user.email);
        const hashedBackupCodes = await Promise.all(enrollment.backupCodes.map(c => bcrypt.hash(c, 10)));
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
            await client.query(`UPDATE users
         SET mfa_secret = $3, mfa_backup_codes = $4::jsonb, mfa_enrolled = false
         WHERE tenant_id = $1 AND id = $2`, [tenantId, userId, enrollment.secret, JSON.stringify(hashedBackupCodes)]);
            await client.query('COMMIT');
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
        return {
            qrCode: enrollment.qrCode,
            secret: enrollment.secret,
            otpauthUrl: enrollment.otpauthUrl,
            backupCodes: enrollment.backupCodes,
        };
    }
    async verifyMfaEnrollment(userId, tenantId, totp) {
        const user = await this.findUserById(tenantId, userId);
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (!user.mfa_secret) {
            throw new common_1.BadRequestException('MFA setup not started. Call /auth/mfa/setup first.');
        }
        if (user.mfa_enrolled) {
            return { enrolled: true };
        }
        const ok = this.totpService.verify(user.mfa_secret, totp);
        if (!ok)
            throw new common_1.UnauthorizedException('Invalid TOTP code');
        const client = await this.pool.connect();
        try {
            await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
            await client.query(`UPDATE users SET mfa_enrolled = true WHERE tenant_id = $1 AND id = $2`, [tenantId, userId]);
        }
        finally {
            client.release();
        }
        return { enrolled: true };
    }
    async verifyMfaLogin(sessionToken, totp, metadata = {}) {
        const payload = this.jwtService.verify(sessionToken, 'mfa_pending');
        const user = await this.findUserById(payload.tenant_id, payload.sub);
        if (!user || !user.mfa_secret) {
            throw new common_1.UnauthorizedException('Invalid session');
        }
        const ok = this.totpService.verify(user.mfa_secret, totp);
        if (!ok) {
            await this.registerFailedAttempt(user);
            throw new common_1.UnauthorizedException('Invalid TOTP code');
        }
        await this.resetFailedAttempts(user.tenant_id, user.id);
        const tokens = await this.issueTokens(user, metadata);
        return { tokens, user: this.toPublic(user) };
    }
    async verifyBackupCode(sessionToken, backupCode, metadata = {}) {
        const payload = this.jwtService.verify(sessionToken, 'mfa_pending');
        const user = await this.findUserById(payload.tenant_id, payload.sub);
        if (!user || !user.mfa_enrolled) {
            throw new common_1.UnauthorizedException('Invalid session');
        }
        const stored = user.mfa_backup_codes;
        if (!Array.isArray(stored) || stored.length === 0) {
            await this.registerFailedAttempt(user);
            throw new common_1.UnauthorizedException('Invalid backup code');
        }
        let matchedIndex = -1;
        for (let i = 0; i < stored.length; i++) {
            const hashed = stored[i];
            if (typeof hashed !== 'string' || hashed.length === 0)
                continue;
            try {
                if (await bcrypt.compare(backupCode, hashed)) {
                    matchedIndex = i;
                    break;
                }
            }
            catch {
            }
        }
        if (matchedIndex === -1) {
            await this.registerFailedAttempt(user);
            throw new common_1.UnauthorizedException('Invalid backup code');
        }
        const remaining = stored.slice(0, matchedIndex).concat(stored.slice(matchedIndex + 1));
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SET LOCAL app.current_tenant = $1', [user.tenant_id]);
            await client.query(`UPDATE users
         SET mfa_backup_codes = $3::jsonb,
             failed_login_attempts = 0,
             locked_until = NULL
         WHERE tenant_id = $1 AND id = $2`, [user.tenant_id, user.id, JSON.stringify(remaining)]);
            await client.query('COMMIT');
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
        const tokens = await this.issueTokens(user, metadata);
        return { tokens, user: this.toPublic(user) };
    }
    async refresh(refreshToken, metadata = {}) {
        const payload = this.jwtService.verify(refreshToken, 'refresh');
        const tokenHash = this.jwtService.hashRefreshToken(refreshToken);
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SET LOCAL app.current_tenant = $1', [payload.tenant_id]);
            const stored = await client.query(`SELECT id, user_id, expires_at, revoked_at
         FROM refresh_tokens
         WHERE tenant_id = $1 AND token_hash = $2`, [payload.tenant_id, tokenHash]);
            if (stored.rows.length === 0) {
                throw new common_1.UnauthorizedException('Refresh token not recognised');
            }
            const row = stored.rows[0];
            if (row.revoked_at) {
                await client.query(`UPDATE refresh_tokens SET revoked_at = NOW()
           WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL`, [payload.tenant_id, row.user_id]);
                await client.query('COMMIT');
                throw new common_1.UnauthorizedException('Refresh token reused — session revoked');
            }
            if (new Date(row.expires_at) < new Date()) {
                throw new common_1.UnauthorizedException('Refresh token expired');
            }
            const user = await this.findUserById(payload.tenant_id, row.user_id, client);
            if (!user || !user.is_active) {
                throw new common_1.UnauthorizedException('User not found or disabled');
            }
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
            const insertResult = await client.query(`INSERT INTO refresh_tokens
           (tenant_id, user_id, token_hash, expires_at, user_agent, ip_address)
         VALUES ($1, $2, $3, NOW() + ($4 || ' seconds')::interval, $5, $6)
         RETURNING id`, [
                user.tenant_id,
                user.id,
                newHash,
                newRefresh.expiresIn.toString(),
                metadata.userAgent || null,
                metadata.ipAddress || null,
            ]);
            await client.query(`UPDATE refresh_tokens
         SET revoked_at = NOW(), replaced_by = $3
         WHERE tenant_id = $1 AND id = $2`, [payload.tenant_id, row.id, insertResult.rows[0].id]);
            await client.query('COMMIT');
            return {
                accessToken: newAccess.token,
                refreshToken: newRefresh.token,
                expiresIn: newAccess.expiresIn,
                tokenType: 'Bearer',
            };
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    async requestPasswordReset(email) {
        const user = await this.findUserByEmail(email);
        if (!user) {
            return {};
        }
        const resetToken = this.jwtService.sign({
            sub: user.id,
            tenant_id: user.tenant_id,
            role: user.role,
            email: user.email,
            type: 'mfa_pending',
        }, { expiresIn: '5m', type: 'mfa_pending' });
        return { resetToken };
    }
    async applyPasswordReset(resetToken, newPassword) {
        const payload = this.jwtService.verify(resetToken, 'mfa_pending');
        const newHash = await this.passwordService.hash(newPassword);
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SET LOCAL app.current_tenant = $1', [payload.tenant_id]);
            await client.query(`UPDATE users
         SET password_hash = $3, failed_login_attempts = 0, locked_until = NULL
         WHERE tenant_id = $1 AND id = $2`, [payload.tenant_id, payload.sub, newHash]);
            await client.query(`UPDATE refresh_tokens SET revoked_at = NOW()
         WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL`, [payload.tenant_id, payload.sub]);
            await client.query('COMMIT');
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    async logout(refreshToken) {
        let payload;
        try {
            payload = this.jwtService.verify(refreshToken, 'refresh');
        }
        catch {
            return;
        }
        const tokenHash = this.jwtService.hashRefreshToken(refreshToken);
        const client = await this.pool.connect();
        try {
            await client.query('SET LOCAL app.current_tenant = $1', [payload.tenant_id]);
            await client.query(`UPDATE refresh_tokens SET revoked_at = NOW()
         WHERE tenant_id = $1 AND token_hash = $2 AND revoked_at IS NULL`, [payload.tenant_id, tokenHash]);
        }
        finally {
            client.release();
        }
    }
    async issueTokens(user, metadata) {
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
            await client.query(`INSERT INTO refresh_tokens
           (tenant_id, user_id, token_hash, expires_at, user_agent, ip_address)
         VALUES ($1, $2, $3, NOW() + ($4 || ' seconds')::interval, $5, $6)`, [
                user.tenant_id,
                user.id,
                refreshHash,
                refresh.expiresIn.toString(),
                metadata.userAgent || null,
                metadata.ipAddress || null,
            ]);
            await client.query(`UPDATE users SET last_login_at = NOW() WHERE tenant_id = $1 AND id = $2`, [user.tenant_id, user.id]);
        }
        finally {
            client.release();
        }
        return {
            accessToken: access.token,
            refreshToken: refresh.token,
            expiresIn: access.expiresIn,
            tokenType: 'Bearer',
        };
    }
    async findUserByEmail(email) {
        const result = await this.pool.query(`SELECT tenant_id, id, email, password_hash, full_name, role, mfa_enrolled,
              mfa_secret, mfa_backup_codes, is_active, failed_login_attempts, locked_until
       FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`, [email]);
        return result.rows[0] || null;
    }
    async findUserById(tenantId, userId, client) {
        const queryRunner = client || this.pool;
        const result = await queryRunner.query(`SELECT tenant_id, id, email, password_hash, full_name, role, mfa_enrolled,
              mfa_secret, mfa_backup_codes, is_active, failed_login_attempts, locked_until
       FROM users WHERE tenant_id = $1 AND id = $2 LIMIT 1`, [tenantId, userId]);
        return result.rows[0] || null;
    }
    async registerFailedAttempt(user) {
        const newCount = user.failed_login_attempts + 1;
        const shouldLock = newCount >= MAX_FAILED_ATTEMPTS;
        const client = await this.pool.connect();
        try {
            await client.query('SET LOCAL app.current_tenant = $1', [user.tenant_id]);
            await client.query(`UPDATE users
         SET failed_login_attempts = $3,
             locked_until = CASE WHEN $4 = true
               THEN NOW() + ($5 || ' minutes')::interval
               ELSE locked_until END
         WHERE tenant_id = $1 AND id = $2`, [user.tenant_id, user.id, newCount, shouldLock, LOCKOUT_MINUTES.toString()]);
        }
        finally {
            client.release();
        }
    }
    async resetFailedAttempts(tenantId, userId) {
        const client = await this.pool.connect();
        try {
            await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
            await client.query(`UPDATE users SET failed_login_attempts = 0, locked_until = NULL
         WHERE tenant_id = $1 AND id = $2`, [tenantId, userId]);
        }
        finally {
            client.release();
        }
    }
    toPublic(user) {
        return {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            tenant_id: user.tenant_id,
            role: user.role,
            mfa_enrolled: user.mfa_enrolled,
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('DB_POOL')),
    __metadata("design:paramtypes", [typeof (_a = typeof pg_1.Pool !== "undefined" && pg_1.Pool) === "function" ? _a : Object, password_service_1.PasswordService,
        jwt_service_1.JwtService,
        totp_service_1.TotpService])
], AuthService);
//# sourceMappingURL=auth.service.js.map