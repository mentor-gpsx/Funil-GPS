"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaginatedAuditDto = exports.ValidateAuditChainResponseDto = exports.ListAuditQueryDto = exports.AuditEntryWithValidationDto = exports.AuditEntryDto = void 0;
class AuditEntryDto {
    id;
    tenant_id;
    table_name;
    operation;
    record_id;
    old_value;
    new_value;
    changed_by;
    changed_at;
    prev_hash;
    hash;
}
exports.AuditEntryDto = AuditEntryDto;
class AuditEntryWithValidationDto extends AuditEntryDto {
    validation;
}
exports.AuditEntryWithValidationDto = AuditEntryWithValidationDto;
class ListAuditQueryDto {
    page;
    limit;
    date_from;
    date_to;
    table_name;
    operation;
    user_id;
    record_id;
}
exports.ListAuditQueryDto = ListAuditQueryDto;
class ValidateAuditChainResponseDto {
    valid;
    recordsChecked;
    brokenAt;
    reason;
    filters;
}
exports.ValidateAuditChainResponseDto = ValidateAuditChainResponseDto;
class PaginatedAuditDto {
    data;
    total;
    page;
    limit;
}
exports.PaginatedAuditDto = PaginatedAuditDto;
//# sourceMappingURL=audit-entry.dto.js.map