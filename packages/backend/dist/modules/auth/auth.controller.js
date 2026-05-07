"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const auth_service_1 = require("./auth.service");
const login_dto_1 = require("./dto/login.dto");
const signup_dto_1 = require("./dto/signup.dto");
const mfa_setup_dto_1 = require("./dto/mfa-setup.dto");
const refresh_dto_1 = require("./dto/refresh.dto");
const jwt_auth_guard_1 = require("./guards/jwt-auth.guard");
let AuthController = class AuthController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    async signup(dto) {
        return this.authService.signup(dto);
    }
    async login(dto, req) {
        return this.authService.login(dto, {
            userAgent: req.headers['user-agent'],
            ipAddress: this.extractIp(req),
        });
    }
    async verifyMfaLogin(dto, req) {
        if (!dto.sessionToken) {
            throw new common_1.BadRequestException('sessionToken is required for /auth/mfa/verify-login');
        }
        return this.authService.verifyMfaLogin(dto.sessionToken, dto.totp, {
            userAgent: req.headers['user-agent'],
            ipAddress: this.extractIp(req),
        });
    }
    async verifyMfaLoginBackup(dto, req) {
        if (!dto.sessionToken) {
            throw new common_1.BadRequestException('sessionToken is required for /auth/mfa/verify-login-backup');
        }
        return this.authService.verifyBackupCode(dto.sessionToken, dto.backupCode, {
            userAgent: req.headers['user-agent'],
            ipAddress: this.extractIp(req),
        });
    }
    async refreshGet(req) {
        const cookieToken = req.cookies?.refreshToken;
        const headerToken = req.headers['x-refresh-token'];
        const token = cookieToken || headerToken;
        if (!token) {
            throw new common_1.BadRequestException('Refresh token required (cookie "refreshToken" or header X-Refresh-Token)');
        }
        return this.authService.refresh(token, {
            userAgent: req.headers['user-agent'],
            ipAddress: this.extractIp(req),
        });
    }
    async refreshPost(dto, req) {
        return this.authService.refresh(dto.refreshToken, {
            userAgent: req.headers['user-agent'],
            ipAddress: this.extractIp(req),
        });
    }
    async setupMfa(req) {
        const user = req.user;
        return this.authService.setupMfa(user.id, user.tenant_id);
    }
    async verifyMfaEnrollment(dto, req) {
        const user = req.user;
        return this.authService.verifyMfaEnrollment(user.id, user.tenant_id, dto.totp);
    }
    async requestPasswordReset(dto) {
        const result = await this.authService.requestPasswordReset(dto.email);
        return {
            message: 'If the email is registered, a password reset link has been sent.',
            ...(process.env.NODE_ENV !== 'production' && result.resetToken
                ? { resetToken: result.resetToken }
                : {}),
        };
    }
    async applyPasswordReset(dto) {
        await this.authService.applyPasswordReset(dto.resetToken, dto.newPassword);
        return { message: 'Password updated. Please sign in again.' };
    }
    async logout(dto) {
        await this.authService.logout(dto.refreshToken);
    }
    async me(req) {
        const user = req.user;
        return {
            id: user.id,
            email: user.email,
            tenant_id: user.tenant_id,
            role: user.role,
            full_name: user.full_name || '',
            mfa_enrolled: user.mfa_enrolled ?? false,
        };
    }
    extractIp(req) {
        const forwarded = req.headers['x-forwarded-for'];
        if (typeof forwarded === 'string' && forwarded.length > 0) {
            return forwarded.split(',')[0].trim();
        }
        return req.socket?.remoteAddress;
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, jwt_auth_guard_1.Public)(),
    (0, common_1.Post)('signup'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Body)(new common_1.ValidationPipe({ transform: true, whitelist: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [signup_dto_1.SignupDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "signup", null);
__decorate([
    (0, jwt_auth_guard_1.Public)(),
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)(new common_1.ValidationPipe({ transform: true, whitelist: true }))),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_dto_1.LoginDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, jwt_auth_guard_1.Public)(),
    (0, common_1.Post)('mfa/verify-login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)(new common_1.ValidationPipe({ transform: true, whitelist: true }))),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [mfa_setup_dto_1.MfaVerifyDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyMfaLogin", null);
__decorate([
    (0, jwt_auth_guard_1.Public)(),
    (0, common_1.Post)('mfa/verify-login-backup'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)(new common_1.ValidationPipe({ transform: true, whitelist: true }))),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [mfa_setup_dto_1.MfaBackupCodeDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyMfaLoginBackup", null);
__decorate([
    (0, jwt_auth_guard_1.Public)(),
    (0, common_1.Get)('refresh'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refreshGet", null);
__decorate([
    (0, jwt_auth_guard_1.Public)(),
    (0, common_1.Post)('refresh'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)(new common_1.ValidationPipe({ transform: true, whitelist: true }))),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [refresh_dto_1.RefreshDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refreshPost", null);
__decorate([
    (0, common_1.Post)('mfa/setup'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "setupMfa", null);
__decorate([
    (0, common_1.Post)('mfa/verify'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)(new common_1.ValidationPipe({ transform: true, whitelist: true }))),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [mfa_setup_dto_1.MfaVerifyDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyMfaEnrollment", null);
__decorate([
    (0, jwt_auth_guard_1.Public)(),
    (0, common_1.Post)('password/reset-request'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)(new common_1.ValidationPipe({ transform: true, whitelist: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "requestPasswordReset", null);
__decorate([
    (0, jwt_auth_guard_1.Public)(),
    (0, common_1.Post)('password/reset'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)(new common_1.ValidationPipe({ transform: true, whitelist: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "applyPasswordReset", null);
__decorate([
    (0, common_1.Post)('logout'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    __param(0, (0, common_1.Body)(new common_1.ValidationPipe({ transform: true, whitelist: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [refresh_dto_1.RefreshDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.Get)('me'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "me", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map