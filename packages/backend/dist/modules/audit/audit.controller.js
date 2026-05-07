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
exports.AuditController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const audit_service_1 = require("./audit.service");
let AuditController = class AuditController {
    auditService;
    constructor(auditService) {
        this.auditService = auditService;
    }
    async list(page, limit, table_name, operation, user_id, record_id, date_from, date_to) {
        return this.auditService.list({
            page,
            limit,
            table_name,
            operation,
            user_id,
            record_id,
            date_from,
            date_to,
        });
    }
    async validate(table_name, record_id, date_from, date_to) {
        return this.auditService.validateChain({
            table_name,
            record_id,
            date_from,
            date_to,
        });
    }
    async findOne(id) {
        return this.auditService.findOne(id);
    }
};
exports.AuditController = AuditController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('page', new common_1.DefaultValuePipe(1), common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)('limit', new common_1.DefaultValuePipe(50), common_1.ParseIntPipe)),
    __param(2, (0, common_1.Query)('table_name')),
    __param(3, (0, common_1.Query)('operation')),
    __param(4, (0, common_1.Query)('user_id')),
    __param(5, (0, common_1.Query)('record_id')),
    __param(6, (0, common_1.Query)('date_from')),
    __param(7, (0, common_1.Query)('date_to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], AuditController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('validate'),
    __param(0, (0, common_1.Query)('table_name')),
    __param(1, (0, common_1.Query)('record_id')),
    __param(2, (0, common_1.Query)('date_from')),
    __param(3, (0, common_1.Query)('date_to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], AuditController.prototype, "validate", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AuditController.prototype, "findOne", null);
exports.AuditController = AuditController = __decorate([
    (0, common_1.Controller)('api/audit'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [audit_service_1.AuditService])
], AuditController);
//# sourceMappingURL=audit.controller.js.map