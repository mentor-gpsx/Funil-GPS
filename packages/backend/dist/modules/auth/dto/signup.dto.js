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
exports.SignupDto = exports.UserRole = void 0;
const class_validator_1 = require("class-validator");
var UserRole;
(function (UserRole) {
    UserRole["ADMIN"] = "admin";
    UserRole["ACCOUNTANT"] = "accountant";
    UserRole["VIEWER"] = "viewer";
})(UserRole || (exports.UserRole = UserRole = {}));
class SignupDto {
    email;
    password;
    full_name;
    tenant_id;
    role;
}
exports.SignupDto = SignupDto;
__decorate([
    (0, class_validator_1.IsEmail)({}, { message: 'A valid email address is required' }),
    (0, class_validator_1.MaxLength)(255),
    __metadata("design:type", String)
], SignupDto.prototype, "email", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8, { message: 'Password must be at least 8 characters' }),
    (0, class_validator_1.MaxLength)(128),
    (0, class_validator_1.Matches)(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, {
        message: 'Password must contain at least one uppercase letter, one lowercase letter, and one digit',
    }),
    __metadata("design:type", String)
], SignupDto.prototype, "password", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    __metadata("design:type", String)
], SignupDto.prototype, "full_name", void 0);
__decorate([
    (0, class_validator_1.IsUUID)('4', { message: 'tenant_id must be a valid UUID' }),
    __metadata("design:type", String)
], SignupDto.prototype, "tenant_id", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(UserRole, { message: 'role must be one of: admin, accountant, viewer' }),
    __metadata("design:type", String)
], SignupDto.prototype, "role", void 0);
//# sourceMappingURL=signup.dto.js.map