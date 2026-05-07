"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const auth_controller_1 = require("./auth.controller");
const auth_service_1 = require("./auth.service");
const jwt_service_1 = require("./jwt.service");
const password_service_1 = require("./password.service");
const totp_service_1 = require("./totp.service");
const jwt_auth_guard_1 = require("./guards/jwt-auth.guard");
const roles_guard_1 = require("./guards/roles.guard");
const tenant_middleware_1 = require("../../middleware/tenant.middleware");
let AuthModule = class AuthModule {
    configure(consumer) {
        consumer
            .apply(tenant_middleware_1.TenantMiddleware)
            .forRoutes({ path: '*', method: common_1.RequestMethod.ALL });
    }
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        controllers: [auth_controller_1.AuthController],
        providers: [
            auth_service_1.AuthService,
            jwt_service_1.JwtService,
            password_service_1.PasswordService,
            totp_service_1.TotpService,
            jwt_auth_guard_1.JwtAuthGuard,
            roles_guard_1.RolesGuard,
        ],
        exports: [jwt_service_1.JwtService, password_service_1.PasswordService, totp_service_1.TotpService, jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, auth_service_1.AuthService],
    })
], AuthModule);
//# sourceMappingURL=auth.module.js.map