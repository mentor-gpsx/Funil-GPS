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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantMiddleware = void 0;
exports.setTenantContext = setTenantContext;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const jwt_service_1 = require("../modules/auth/jwt.service");
let TenantMiddleware = class TenantMiddleware {
    _pool;
    jwtService;
    constructor(_pool, jwtService) {
        this._pool = _pool;
        this.jwtService = jwtService;
    }
    use(req, _res, next) {
        const skipPaths = ['/auth/login', '/auth/signup', '/auth/refresh', '/auth/mfa/verify-login'];
        if (skipPaths.some(p => req.path.startsWith(p))) {
            return next();
        }
        const header = req.headers['authorization'];
        if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) {
            return next();
        }
        const token = header.slice('Bearer '.length).trim();
        if (!token)
            return next();
        try {
            const payload = this.jwtService.verify(token, 'access');
            if (!payload.tenant_id) {
                throw new common_1.BadRequestException('JWT missing tenant_id custom claim');
            }
            req.user = {
                id: payload.sub,
                tenant_id: payload.tenant_id,
                role: payload.role,
                email: payload.email,
            };
        }
        catch {
        }
        next();
    }
};
exports.TenantMiddleware = TenantMiddleware;
exports.TenantMiddleware = TenantMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('DB_POOL')),
    __metadata("design:paramtypes", [typeof (_a = typeof pg_1.Pool !== "undefined" && pg_1.Pool) === "function" ? _a : Object, jwt_service_1.JwtService])
], TenantMiddleware);
async function setTenantContext(client, tenantId) {
    if (!tenantId || typeof tenantId !== 'string') {
        throw new common_1.BadRequestException('tenantId is required for SET LOCAL');
    }
    await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
}
//# sourceMappingURL=tenant.middleware.js.map