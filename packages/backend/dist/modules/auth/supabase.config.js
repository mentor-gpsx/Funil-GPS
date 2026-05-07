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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseConfig = void 0;
const common_1 = require("@nestjs/common");
let SupabaseConfig = class SupabaseConfig {
    provider;
    supabase;
    constructor() {
        this.provider = process.env.AUTH_PROVIDER || 'local';
        if (this.provider === 'supabase') {
            const url = process.env.SUPABASE_URL;
            const anonKey = process.env.SUPABASE_ANON_KEY;
            const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            const jwtSecret = process.env.SUPABASE_JWT_SECRET;
            const jwtIssuer = process.env.SUPABASE_JWT_ISSUER || 'supabase';
            if (!url || !anonKey || !serviceRoleKey || !jwtSecret) {
                throw new common_1.InternalServerErrorException('AUTH_PROVIDER=supabase requires SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET');
            }
            this.supabase = { url, anonKey, serviceRoleKey, jwtSecret, jwtIssuer };
        }
        else {
            this.supabase = null;
        }
    }
    isSupabase() {
        return this.provider === 'supabase';
    }
    isLocal() {
        return this.provider === 'local';
    }
};
exports.SupabaseConfig = SupabaseConfig;
exports.SupabaseConfig = SupabaseConfig = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], SupabaseConfig);
//# sourceMappingURL=supabase.config.js.map