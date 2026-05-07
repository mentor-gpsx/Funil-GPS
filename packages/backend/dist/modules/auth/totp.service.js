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
exports.TotpService = void 0;
const common_1 = require("@nestjs/common");
const crypto = __importStar(require("crypto"));
const speakeasy = __importStar(require("speakeasy"));
const qrcode = __importStar(require("qrcode"));
let TotpService = class TotpService {
    issuer;
    window;
    digits;
    constructor() {
        this.issuer = process.env.TOTP_ISSUER || 'Funil GPS ERP';
        this.window = parseInt(process.env.TOTP_WINDOW || '1', 10);
        this.digits = parseInt(process.env.TOTP_DIGITS || '6', 10);
    }
    async enroll(accountLabel) {
        if (!accountLabel) {
            throw new common_1.BadRequestException('accountLabel is required for TOTP enrolment');
        }
        const secretObj = speakeasy.generateSecret({
            name: `${this.issuer}:${accountLabel}`,
            issuer: this.issuer,
            length: 20,
        });
        let otpauthUrl = secretObj.otpauth_url || '';
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
    verify(secret, token) {
        if (!secret || !token)
            return false;
        if (!/^\d{6}$/.test(token))
            return false;
        return speakeasy.totp.verify({
            secret,
            encoding: 'base32',
            token,
            window: this.window,
            digits: this.digits,
        });
    }
    generateBackupCodes(count) {
        const codes = [];
        for (let i = 0; i < count; i++) {
            const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
            codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
        }
        return codes;
    }
};
exports.TotpService = TotpService;
exports.TotpService = TotpService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], TotpService);
//# sourceMappingURL=totp.service.js.map