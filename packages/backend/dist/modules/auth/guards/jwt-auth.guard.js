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
exports.JwtAuthGuard = exports.Public = exports.IS_PUBLIC_KEY = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const jwt_service_1 = require("../jwt.service");
exports.IS_PUBLIC_KEY = 'isPublic';
const Public = () => (target, key, descriptor) => {
    if (descriptor) {
        Reflect.defineMetadata(exports.IS_PUBLIC_KEY, true, descriptor.value);
        return descriptor;
    }
    Reflect.defineMetadata(exports.IS_PUBLIC_KEY, true, target);
    return target;
};
exports.Public = Public;
let JwtAuthGuard = class JwtAuthGuard {
    jwtService;
    reflector;
    constructor(jwtService, reflector) {
        this.jwtService = jwtService;
        this.reflector = reflector;
    }
    canActivate(context) {
        const isPublic = this.reflector.getAllAndOverride(exports.IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic)
            return true;
        const req = context.switchToHttp().getRequest();
        const header = req.headers['authorization'];
        if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) {
            throw new common_1.UnauthorizedException('Missing or malformed Authorization header');
        }
        const token = header.slice('Bearer '.length).trim();
        if (!token) {
            throw new common_1.UnauthorizedException('Empty bearer token');
        }
        const payload = this.jwtService.verify(token, 'access');
        req.user = {
            id: payload.sub,
            tenant_id: payload.tenant_id,
            role: payload.role,
            email: payload.email,
        };
        return true;
    }
};
exports.JwtAuthGuard = JwtAuthGuard;
exports.JwtAuthGuard = JwtAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [jwt_service_1.JwtService,
        core_1.Reflector])
], JwtAuthGuard);
//# sourceMappingURL=jwt-auth.guard.js.map