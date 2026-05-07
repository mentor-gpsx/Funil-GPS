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
Object.defineProperty(exports, "__esModule", { value: true });
exports.JwtService = void 0;
const common_1 = require("@nestjs/common");
const jwt = __importStar(require("jsonwebtoken"));
const crypto = __importStar(require("crypto"));
let JwtService = class JwtService {
    secret;
    issuer;
    audience;
    accessTokenTtl;
    refreshTokenTtl;
    mfaPendingTtl;
    constructor() {
        const secret = process.env.JWT_SECRET;
        if (!secret || secret.length < 32) {
            if (process.env.NODE_ENV === 'production') {
                throw new common_1.InternalServerErrorException('JWT_SECRET is required and must be >= 32 chars in production');
            }
            this.secret = secret || crypto.randomBytes(32).toString('hex');
        }
        else {
            this.secret = secret;
        }
        this.issuer = process.env.JWT_ISSUER || 'funil-gps-erp';
        this.audience = process.env.JWT_AUDIENCE || 'funil-gps-api';
        this.accessTokenTtl = process.env.JWT_ACCESS_TTL || '15m';
        this.refreshTokenTtl = process.env.JWT_REFRESH_TTL || '24h';
        this.mfaPendingTtl = process.env.JWT_MFA_PENDING_TTL || '5m';
    }
    sign(payload, options) {
        const fullPayload = {
            ...payload,
            type: options.type,
            jti: options.jti || crypto.randomBytes(16).toString('hex'),
        };
        return jwt.sign(fullPayload, this.secret, {
            algorithm: 'HS256',
            expiresIn: options.expiresIn,
            issuer: this.issuer,
            audience: this.audience,
        });
    }
    signAccessToken(user) {
        const token = this.sign({
            sub: user.id,
            tenant_id: user.tenant_id,
            role: user.role,
            email: user.email,
            type: 'access',
        }, { expiresIn: this.accessTokenTtl, type: 'access' });
        return { token, expiresIn: this.parseTtl(this.accessTokenTtl) };
    }
    signRefreshToken(user) {
        const jti = crypto.randomBytes(16).toString('hex');
        const token = this.sign({
            sub: user.id,
            tenant_id: user.tenant_id,
            role: user.role,
            email: user.email,
            type: 'refresh',
        }, { expiresIn: this.refreshTokenTtl, type: 'refresh', jti });
        return { token, jti, expiresIn: this.parseTtl(this.refreshTokenTtl) };
    }
    signMfaPendingToken(user) {
        return this.sign({
            sub: user.id,
            tenant_id: user.tenant_id,
            role: user.role,
            email: user.email,
            type: 'mfa_pending',
        }, { expiresIn: this.mfaPendingTtl, type: 'mfa_pending' });
    }
    verify(token, expectedType) {
        try {
            const decoded = jwt.verify(token, this.secret, {
                algorithms: ['HS256'],
                issuer: this.issuer,
                audience: this.audience,
            });
            if (expectedType && decoded.type !== expectedType) {
                throw new common_1.UnauthorizedException(`Invalid token type: expected ${expectedType}, got ${decoded.type}`);
            }
            return decoded;
        }
        catch (err) {
            if (err instanceof common_1.UnauthorizedException) {
                throw err;
            }
            const reason = err instanceof jwt.TokenExpiredError
                ? 'Token expired'
                : err instanceof jwt.JsonWebTokenError
                    ? 'Invalid token signature'
                    : 'Token verification failed';
            throw new common_1.UnauthorizedException(reason);
        }
    }
    hashRefreshToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }
    parseTtl(ttl) {
        if (typeof ttl === 'number')
            return ttl;
        const match = /^(\d+)\s*([smhd])$/i.exec(ttl);
        if (!match) {
            throw new common_1.InternalServerErrorException(`Invalid TTL format: ${ttl}`);
        }
        const value = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();
        const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
        return value * multipliers[unit];
    }
};
exports.JwtService = JwtService;
exports.JwtService = JwtService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], JwtService);
//# sourceMappingURL=jwt.service.js.map