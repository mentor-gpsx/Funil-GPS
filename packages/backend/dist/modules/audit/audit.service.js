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
exports.AuditService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const core_1 = require("@nestjs/core");
const audit_hash_1 = require("../../utils/audit-hash");
let AuditService = class AuditService {
    pool;
    request;
    constructor(pool, request) {
        this.pool = pool;
        this.request = request;
    }
    getTenantId() {
        const tenantId = this.request.user?.tenant_id;
        if (!tenantId) {
            throw new common_1.BadRequestException('Tenant ID not found in request');
        }
        return tenantId;
    }
    SELECT_PROJECTION = `
    id::text                          AS id,
    tenant_id,
    table_name,
    operation,
    record_id,
    old_value,
    new_value,
    changed_by,
    changed_at,
    to_char(changed_at AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS changed_at_iso,
    prev_hash,
    hash
  `;
    async list(query) {
        const tenantId = this.getTenantId();
        const page = Math.max(1, query.page ?? 1);
        const limit = Math.max(1, Math.min(500, query.limit ?? 50));
        const offset = (page - 1) * limit;
        const client = await this.pool.connect();
        try {
            await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
            const filters = ['tenant_id = $1'];
            const params = [tenantId];
            if (query.table_name) {
                filters.push(`table_name = $${params.length + 1}`);
                params.push(query.table_name);
            }
            if (query.operation) {
                filters.push(`operation = $${params.length + 1}`);
                params.push(query.operation);
            }
            if (query.user_id) {
                filters.push(`changed_by = $${params.length + 1}`);
                params.push(query.user_id);
            }
            if (query.record_id) {
                filters.push(`record_id = $${params.length + 1}`);
                params.push(query.record_id);
            }
            if (query.date_from) {
                filters.push(`changed_at >= $${params.length + 1}`);
                params.push(query.date_from);
            }
            if (query.date_to) {
                filters.push(`changed_at <= $${params.length + 1}`);
                params.push(query.date_to);
            }
            const where = filters.join(' AND ');
            const dataSql = `
        SELECT ${this.SELECT_PROJECTION}
        FROM audit_logs
        WHERE ${where}
        ORDER BY changed_at DESC, id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
            const dataParams = [...params, limit, offset];
            const countSql = `SELECT COUNT(*)::bigint AS count FROM audit_logs WHERE ${where}`;
            const [dataResult, countResult] = await Promise.all([
                client.query(dataSql, dataParams),
                client.query(countSql, params),
            ]);
            const data = dataResult.rows.map(row => this.rowToDto(row));
            const total = parseInt(countResult.rows[0].count, 10);
            return { data, total, page, limit };
        }
        finally {
            client.release();
        }
    }
    async findOne(id) {
        const tenantId = this.getTenantId();
        if (!id || !/^\d+$/.test(id)) {
            throw new common_1.BadRequestException('Audit id must be a numeric string');
        }
        const client = await this.pool.connect();
        try {
            await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
            const result = await client.query(`SELECT ${this.SELECT_PROJECTION}
         FROM audit_logs
         WHERE tenant_id = $1 AND id = $2::bigint`, [tenantId, id]);
            if (result.rows.length === 0) {
                throw new common_1.NotFoundException('Audit entry not found');
            }
            const row = result.rows[0];
            const dto = this.rowToDto(row);
            const recomputed = (0, audit_hash_1.computeAuditHash)({
                prevHash: dto.prev_hash,
                oldValue: dto.old_value,
                newValue: dto.new_value,
                changedAt: row.changed_at_iso,
            });
            const valid = recomputed === dto.hash;
            return {
                ...dto,
                validation: valid
                    ? { valid: true, recomputedHash: recomputed }
                    : {
                        valid: false,
                        recomputedHash: recomputed,
                        reason: 'Stored hash does not match recomputed hash for this record',
                    },
            };
        }
        finally {
            client.release();
        }
    }
    async validateChain(filters) {
        const tenantId = this.getTenantId();
        const client = await this.pool.connect();
        try {
            await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
            const conds = ['tenant_id = $1'];
            const params = [tenantId];
            if (filters.table_name) {
                conds.push(`table_name = $${params.length + 1}`);
                params.push(filters.table_name);
            }
            if (filters.record_id) {
                conds.push(`record_id = $${params.length + 1}`);
                params.push(filters.record_id);
            }
            if (filters.date_from) {
                conds.push(`changed_at >= $${params.length + 1}`);
                params.push(filters.date_from);
            }
            if (filters.date_to) {
                conds.push(`changed_at <= $${params.length + 1}`);
                params.push(filters.date_to);
            }
            const sql = `
        SELECT ${this.SELECT_PROJECTION}
        FROM audit_logs
        WHERE ${conds.join(' AND ')}
        ORDER BY tenant_id, table_name, record_id, id ASC
      `;
            const result = await client.query(sql, params);
            const chains = new Map();
            for (const row of result.rows) {
                const key = `${row.table_name}|${row.record_id}`;
                if (!chains.has(key))
                    chains.set(key, []);
                chains.get(key).push({
                    id: row.id,
                    hash: row.hash,
                    prevHash: row.prev_hash,
                    oldValue: row.old_value,
                    newValue: row.new_value,
                    changedAt: row.changed_at_iso,
                });
            }
            let recordsChecked = 0;
            for (const [, entries] of chains) {
                const r = (0, audit_hash_1.validateAuditChain)(entries);
                recordsChecked += r.recordsChecked;
                if (!r.valid) {
                    return {
                        valid: false,
                        recordsChecked,
                        brokenAt: r.brokenAt !== null ? String(r.brokenAt) : null,
                        reason: r.reason,
                        filters,
                    };
                }
            }
            return {
                valid: true,
                recordsChecked,
                brokenAt: null,
                filters,
            };
        }
        finally {
            client.release();
        }
    }
    rowToDto(row) {
        return {
            id: row.id,
            tenant_id: row.tenant_id,
            table_name: row.table_name,
            operation: row.operation,
            record_id: row.record_id,
            old_value: row.old_value,
            new_value: row.new_value,
            changed_by: row.changed_by,
            changed_at: row.changed_at_iso,
            prev_hash: row.prev_hash,
            hash: row.hash,
        };
    }
};
exports.AuditService = AuditService;
exports.AuditService = AuditService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('DB_POOL')),
    __param(1, (0, common_1.Inject)(core_1.REQUEST)),
    __metadata("design:paramtypes", [typeof (_a = typeof pg_1.Pool !== "undefined" && pg_1.Pool) === "function" ? _a : Object, Object])
], AuditService);
//# sourceMappingURL=audit.service.js.map